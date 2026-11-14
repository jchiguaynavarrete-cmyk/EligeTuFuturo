const { db } = require('../config/supabase');
const { activarPlanDeSolicitud } = require('./pagos.controller');

/**
 * POST /api/solicitudes/reclamar
 *
 * Enlaza a la cuenta recién creada las solicitudes que llegaron por el
 * formulario público con ese mismo correo.
 *
 * El correo NO se recibe del cuerpo de la petición: se toma del token de
 * Supabase, que ya está verificado. Si viniera del navegador, cualquiera
 * podría reclamar las solicitudes de otra institución escribiendo su correo.
 */
async function reclamarSolicitudes(req, res) {
  const { uid, email } = req.usuario;

  if (!email) {
    return res.status(400).json({ error: 'SIN_CORREO' });
  }

  try {
    const { data, error } = await db
      .from('solicitudes')
      .update({ solicitante_id: uid })
      .eq('correo', email.toLowerCase())
      .is('solicitante_id', null)
      .select('id');

    if (error) throw error;

    const enlazadas = (data || []).length;
    if (enlazadas > 0) {
      console.log(`[SOLICITUDES] ${enlazadas} solicitud(es) enlazadas a ${email}`);
    }

    return res.json({ enlazadas });
  } catch (err) {
    console.error('[SOLICITUDES] Error al enlazar:', err.message);
    return res.status(500).json({ error: 'ERROR_INTERNO' });
  }
}

/**
 * POST /api/solicitudes/activar
 *
 * Deja vigente un plan que no requiere pago (el Piloto).
 *
 * Va por el backend porque la tabla `instituciones` no acepta escrituras
 * desde el navegador: el plan de una institución no debe depender de lo
 * que diga el cliente. Solo un administrador puede llamarlo.
 */
async function activarSolicitud(req, res) {
  const { solicitudId } = req.body || {};

  if (!solicitudId) {
    return res.status(400).json({ error: 'SOLICITUD_NO_ENCONTRADA' });
  }

  try {
    const { data: solicitud } = await db
      .from('solicitudes')
      .select('estado, plan_id')
      .eq('id', solicitudId)
      .maybeSingle();

    if (!solicitud) {
      return res.status(404).json({ error: 'SOLICITUD_NO_ENCONTRADA' });
    }

    if (solicitud.estado !== 'aprobada') {
      return res.status(409).json({ error: 'SOLICITUD_NO_APROBADA' });
    }

    const { data: plan } = await db
      .from('planes')
      .select('requiere_pago')
      .eq('id', solicitud.plan_id)
      .maybeSingle();

    // Un plan pagado solo se activa al confirmar la transacción.
    if (plan?.requiere_pago !== false) {
      return res.status(409).json({ error: 'PLAN_REQUIERE_PAGO' });
    }

    await activarPlanDeSolicitud(solicitudId, null);

    return res.json({ activado: true });
  } catch (err) {
    console.error('[SOLICITUDES] Error al activar:', err.message);

    if (err.message === 'SOLICITUD_SIN_DUENO') {
      return res.status(409).json({ error: 'SOLICITUD_SIN_DUENO' });
    }

    return res.status(500).json({ error: 'ERROR_INTERNO' });
  }
}


/**
 * Contraseña temporal legible.
 *
 * El administrador se la dicta por teléfono al encargado, así que no
 * puede tener caracteres que se confundan al hablar. Se evitan las
 * letras y números ambiguos (l, I, 1, O, 0) y se arma como dos bloques
 * separados por un guion, que es más fácil de leer en voz alta.
 */
function generarPasswordTemporal() {
  const letras = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const minus = 'abcdefghijkmnpqrstuvwxyz';
  const numeros = '23456789';

  const azar = (fuente, cantidad) =>
    Array.from({ length: cantidad }, () =>
      fuente[Math.floor(Math.random() * fuente.length)]
    ).join('');

  // Cumple las mismas exigencias que pide el registro de la app.
  return `${azar(letras, 1)}${azar(minus, 4)}-${azar(numeros, 4)}`;
}

/**
 * POST /api/solicitudes/habilitar-cuenta
 *
 * Deja a la institución en condiciones de entrar y pagar. Se llama al
 * aprobar una solicitud, desde el panel de administración.
 *
 * Existe porque el rol de institución no se puede auto-asignar: la base
 * crea a todo el mundo como estudiante a propósito. Alguien con permisos
 * tiene que habilitar la cuenta, y ese alguien es el administrador.
 *
 * Es idempotente: si la cuenta ya existe, no la toca ni cambia su clave,
 * solo se asegura del rol y del enlace con la solicitud.
 */
async function habilitarCuenta(req, res) {
  const { solicitudId } = req.body || {};

  if (!solicitudId) {
    return res.status(400).json({ error: 'SOLICITUD_NO_ENCONTRADA' });
  }

  try {
    const { data: solicitud } = await db
      .from('solicitudes')
      .select('id, correo, encargado, nombre_institucion, solicitante_id')
      .eq('id', solicitudId)
      .maybeSingle();

    if (!solicitud) {
      return res.status(404).json({ error: 'SOLICITUD_NO_ENCONTRADA' });
    }

    const correo = (solicitud.correo || '').trim().toLowerCase();
    if (!correo) {
      return res.status(409).json({ error: 'SOLICITUD_SIN_CORREO' });
    }

    // ¿Ya hay una cuenta con ese correo?
    const { data: existentes } = await db.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    const yaExiste = (existentes?.users || []).find(
      (u) => (u.email || '').toLowerCase() === correo
    );

    let uid = yaExiste?.id || null;
    let passwordTemporal = null;

    if (!uid) {
      const password = generarPasswordTemporal();
      const partes = (solicitud.encargado || '').trim().split(/\s+/);

      const { data: creado, error: errCrear } = await db.auth.admin.createUser({
        email: correo,
        password,
        // Se da por verificado: el administrador ya habló con esta persona
        // y le entrega el acceso en mano. Sin esto no podría ni entrar.
        email_confirm: true,
        user_metadata: {
          nombre: solicitud.encargado || solicitud.nombre_institucion,
          nombres: partes[0] || '',
          apellido_paterno: partes[1] || '',
          apellido_materno: partes.slice(2).join(' ') || '',
        },
      });

      if (errCrear) throw errCrear;

      uid = creado.user.id;
      passwordTemporal = password;
    }

    // Rol de institución. La base crea a todos como estudiante.
    const { error: errRol } = await db
      .from('perfiles')
      .update({ rol: 'institucion' })
      .eq('id', uid);

    if (errRol) throw errRol;

    // La solicitud pasa a tener dueño, que es lo que habilita el pago.
    if (!solicitud.solicitante_id) {
      const { error: errEnlace } = await db
        .from('solicitudes')
        .update({ solicitante_id: uid })
        .eq('id', solicitudId);

      if (errEnlace) throw errEnlace;
    }

    console.log(`[CUENTAS] Institucion habilitada: ${correo}`);

    return res.json({
      correo,
      // Solo viene cuando la cuenta se acaba de crear. Si ya existía, no
      // se devuelve nada: no se conoce su clave ni se le cambia.
      passwordTemporal,
      cuentaNueva: Boolean(passwordTemporal),
    });
  } catch (err) {
    console.error('[CUENTAS] Error al habilitar:', err.message);
    return res.status(500).json({ error: 'ERROR_HABILITANDO_CUENTA' });
  }
}

module.exports = { reclamarSolicitudes, activarSolicitud, habilitarCuenta };
