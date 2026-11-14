const { db } = require('../config/supabase');

const ROLES = ['user', 'institucion', 'admin'];
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Dígito verificador chileno, módulo 11. */
function digitoVerificador(numero) {
  let suma = 0;
  let mult = 2;

  for (let i = String(numero).length - 1; i >= 0; i--) {
    suma += Number(String(numero)[i]) * mult;
    mult = mult === 7 ? 2 : mult + 1;
  }

  const resto = 11 - (suma % 11);
  return resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
}

/** Valida y normaliza un RUT. Devuelve `null` si no sirve. */
function normalizarRut(rut) {
  const limpio = String(rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
  if (limpio.length < 7 || limpio.length > 9) return null;

  const cuerpo = limpio.slice(0, -1);
  const dado = limpio.slice(-1);
  if (digitoVerificador(cuerpo) !== dado) return null;

  const conPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return { formateado: conPuntos + '-' + dado, limpio };
}

/** Junta los nombres en el campo `nombre`, que es el que se muestra. */
function nombreCompleto(nombres, paterno, materno) {
  return [nombres, paterno, materno]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * ¿Ese correo ya lo usa otra cuenta?
 *
 * Se comprueba contra la tabla de perfiles porque Supabase responde a un
 * correo repetido con un "Error updating user" genérico, imposible de
 * distinguir de una falla real.
 */
async function correoOcupado(email, idExcluido) {
  let consulta = db.from('perfiles').select('id').eq('email', email);
  if (idExcluido) consulta = consulta.neq('id', idExcluido);

  const { data } = await consulta.maybeSingle();
  return Boolean(data);
}

/**
 * Comprueba que quede al menos un administrador aparte del indicado.
 *
 * Sin administradores nadie podría gestionar usuarios, solicitudes ni
 * planes, y recuperar el acceso exigiría entrar a la base a mano.
 */
async function quedaOtroAdmin(idExcluido) {
  const { count } = await db
    .from('perfiles')
    .select('*', { count: 'exact', head: true })
    .eq('rol', 'admin')
    .neq('id', idExcluido);

  return (count ?? 0) > 0;
}

/**
 * POST /api/usuarios
 *
 * Crea una cuenta desde el panel. Va por el backend porque crear en
 * Supabase Auth exige la llave de servicio.
 *
 * Nace con el correo ya confirmado: la está creando un administrador que
 * entregará el acceso en mano, no alguien registrándose por su cuenta.
 */
async function crearUsuario(req, res) {
  const d = req.body || {};

  const email = String(d.email || '').trim().toLowerCase();
  const password = String(d.password || '');
  const nombres = String(d.nombres || '').trim();
  const paterno = String(d.apellidoPaterno || '').trim();
  const materno = String(d.apellidoMaterno || '').trim();
  const rol = ROLES.includes(d.rol) ? d.rol : 'user';

  if (!CORREO.test(email)) {
    return res.status(400).json({ error: 'CORREO_INVALIDO' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'PASSWORD_CORTA' });
  }

  if (!nombres || !paterno) {
    return res.status(400).json({ error: 'FALTA_NOMBRE' });
  }

  const rut = normalizarRut(d.rut);
  if (!rut) {
    return res.status(400).json({ error: 'RUT_INVALIDO' });
  }

  try {
    /*
     * El RUT es único en la base. Se avisa antes de crear la cuenta para
     * no dejar un usuario a medias si la inserción del perfil falla.
     */
    const { data: repetido } = await db
      .from('perfiles')
      .select('id')
      .eq('rut_limpio', rut.limpio)
      .maybeSingle();

    if (repetido) {
      return res.status(409).json({ error: 'RUT_YA_REGISTRADO' });
    }

    if (await correoOcupado(email)) {
      return res.status(409).json({ error: 'CORREO_YA_REGISTRADO' });
    }

    const { data: creado, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        nombre: nombreCompleto(nombres, paterno, materno),
        nombres,
        apellido_paterno: paterno,
        apellido_materno: materno,
        rut: rut.formateado,
        rut_limpio: rut.limpio,
      },
    });

    if (error) {
      if (String(error.message || '').toLowerCase().includes('already')) {
        return res.status(409).json({ error: 'CORREO_YA_REGISTRADO' });
      }
      throw error;
    }

    const uid = creado.user.id;

    // La base crea a todos como estudiante a propósito; el rol se aplica
    // después, y solo desde aquí.
    if (rol !== 'user') {
      const { error: errRol } = await db
        .from('perfiles')
        .update({ rol })
        .eq('id', uid);

      if (errRol) throw errRol;
    }

    console.log('[USUARIOS] Cuenta creada: ' + email + ' (' + rol + ')');
    return res.json({ id: uid, email, rol });
  } catch (err) {
    console.error('[USUARIOS] Error al crear:', err.message);
    return res.status(500).json({ error: 'ERROR_CREANDO' });
  }
}

/**
 * PATCH /api/usuarios/:id
 *
 * Cambia correo, nombre o rol. El correo vive en Supabase Auth y el resto
 * en la tabla de perfiles, así que hay que tocar los dos lados.
 */
async function actualizarUsuario(req, res) {
  const { id } = req.params;
  const { uid } = req.usuario;
  const d = req.body || {};

  try {
    const { data: perfil } = await db
      .from('perfiles')
      .select('rol, email')
      .eq('id', id)
      .maybeSingle();

    if (!perfil) {
      return res.status(404).json({ error: 'USUARIO_NO_ENCONTRADO' });
    }

    const cambios = {};

    // ----------------------------- Nombre -----------------------------
    if (d.nombres !== undefined || d.apellidoPaterno !== undefined) {
      const nombres = String(d.nombres || '').trim();
      const paterno = String(d.apellidoPaterno || '').trim();
      const materno = String(d.apellidoMaterno || '').trim();

      if (!nombres || !paterno) {
        return res.status(400).json({ error: 'FALTA_NOMBRE' });
      }

      cambios.nombres = nombres;
      cambios.apellido_paterno = paterno;
      cambios.apellido_materno = materno || null;
      cambios.nombre = nombreCompleto(nombres, paterno, materno);
    }

    // ------------------------------ Rol ------------------------------
    if (d.rol !== undefined && d.rol !== perfil.rol) {
      if (!ROLES.includes(d.rol)) {
        return res.status(400).json({ error: 'ROL_INVALIDO' });
      }

      /*
       * Quitarse a uno mismo el rol de administrador es cerrarse la
       * puerta desde dentro: la pantalla deja de ser accesible en el acto
       * y no habría forma de volver.
       */
      if (id === uid && d.rol !== 'admin') {
        return res.status(409).json({ error: 'NO_TE_QUITES_ADMIN' });
      }

      if (perfil.rol === 'admin' && d.rol !== 'admin') {
        if (!(await quedaOtroAdmin(id))) {
          return res.status(409).json({ error: 'ULTIMO_ADMINISTRADOR' });
        }
      }

      cambios.rol = d.rol;
    }

    // ----------------------------- Correo -----------------------------
    const correoNuevo = String(d.email || '').trim().toLowerCase();

    if (correoNuevo && correoNuevo !== String(perfil.email || '').toLowerCase()) {
      if (!CORREO.test(correoNuevo)) {
        return res.status(400).json({ error: 'CORREO_INVALIDO' });
      }

      if (await correoOcupado(correoNuevo, id)) {
        return res.status(409).json({ error: 'CORREO_YA_REGISTRADO' });
      }

      /*
       * Se marca como confirmado: lo está cambiando un administrador, y
       * dejarlo sin confirmar dejaría a la persona fuera de su cuenta
       * esperando un correo que quizá nunca abra.
       */
      const { error: errCorreo } = await db.auth.admin.updateUserById(id, {
        email: correoNuevo,
        email_confirm: true,
      });

      if (errCorreo) {
        if (String(errCorreo.message || '').toLowerCase().includes('already')) {
          return res.status(409).json({ error: 'CORREO_YA_REGISTRADO' });
        }
        throw errCorreo;
      }

      cambios.email = correoNuevo;
    }

    if (Object.keys(cambios).length === 0) {
      return res.json({ actualizado: false });
    }

    const { error } = await db.from('perfiles').update(cambios).eq('id', id);
    if (error) throw error;

    console.log('[USUARIOS] Cuenta actualizada: ' + (cambios.email || perfil.email));
    return res.json({ actualizado: true });
  } catch (err) {
    console.error('[USUARIOS] Error al actualizar:', err.message);
    return res.status(500).json({ error: 'ERROR_ACTUALIZANDO' });
  }
}

/**
 * DELETE /api/usuarios/:id
 *
 * Borra una cuenta por completo. Va por el backend porque borrar en
 * Supabase Auth exige la llave de servicio, que nunca viaja al navegador.
 *
 * Lo que se lleva por delante, según las reglas de la base:
 *   - su perfil y sus carreras favoritas
 *   - su institución, si la tenía, con el plan vigente incluido
 *
 * Lo que NO se borra, a propósito:
 *   - las solicitudes que envió, que quedan sin titular
 *   - los pagos registrados, que son el respaldo de una transacción real
 */
async function eliminarUsuario(req, res) {
  const { id } = req.params;
  const { uid } = req.usuario;

  if (!id) {
    return res.status(400).json({ error: 'USUARIO_NO_ENCONTRADO' });
  }

  /*
   * Nadie se borra a sí mismo. Suena obvio, pero es el error más fácil de
   * cometer en una lista donde uno también aparece, y deja al
   * administrador fuera de su propio sistema.
   */
  if (id === uid) {
    return res.status(409).json({ error: 'NO_PUEDES_BORRARTE' });
  }

  try {
    const { data: perfil } = await db
      .from('perfiles')
      .select('rol, nombre, email')
      .eq('id', id)
      .maybeSingle();

    if (!perfil) {
      return res.status(404).json({ error: 'USUARIO_NO_ENCONTRADO' });
    }

    if (perfil.rol === 'admin' && !(await quedaOtroAdmin(id))) {
      return res.status(409).json({ error: 'ULTIMO_ADMINISTRADOR' });
    }

    const { error } = await db.auth.admin.deleteUser(id);
    if (error) throw error;

    console.log('[USUARIOS] Cuenta eliminada: ' + perfil.email);

    return res.json({ eliminado: true, email: perfil.email });
  } catch (err) {
    console.error('[USUARIOS] Error al eliminar:', err.message);
    return res.status(500).json({ error: 'ERROR_ELIMINANDO' });
  }
}

module.exports = { crearUsuario, actualizarUsuario, eliminarUsuario };
