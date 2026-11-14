const { db } = require('../config/supabase');

/** Ventana para frenar envíos repetidos desde el mismo correo. */
const MINUTOS_ENTRE_ENVIOS = 10;

const esTexto = (v, min, max) =>
  typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;

const esCorreo = (v) =>
  typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

/**
 * POST /api/contacto
 *
 * Recibe el formulario público de la landing institucional.
 *
 * No exige sesión —quien evalúa contratar todavía no tiene cuenta—, así que
 * la validación se hace aquí y el guardado va con el Admin SDK. Las reglas
 * de Firestore siguen cerradas a escritura anónima.
 */
async function crearContacto(req, res) {
  const d = req.body || {};

  const nombre = (d.nombre || '').trim();
  const cargo = (d.cargo || '').trim();
  const institucion = (d.institucion || '').trim();
  const correo = (d.correo || '').trim().toLowerCase();
  const telefono = (d.telefono || '').trim();
  const cantidadAlumnos = Number(d.cantidadAlumnos);

  const valido =
    esTexto(nombre, 3, 60) &&
    nombre.split(/\s+/).filter(Boolean).length >= 2 &&
    esTexto(cargo, 3, 50) &&
    esTexto(institucion, 3, 80) &&
    esCorreo(correo) &&
    Number.isInteger(cantidadAlumnos) &&
    cantidadAlumnos > 0 &&
    cantidadAlumnos <= 500000;

  if (!valido) {
    return res.status(400).json({ error: 'DATOS_INVALIDOS' });
  }

  try {
    // Freno simple contra envíos repetidos: un correo cada 10 minutos.
    const desde = new Date(Date.now() - MINUTOS_ENTRE_ENVIOS * 60 * 1000).toISOString();

    const { data: recientes } = await db
      .from('contactos')
      .select('id')
      .eq('correo', correo)
      .gt('creado_en', desde)
      .limit(1);

    if (recientes && recientes.length > 0) {
      console.log(`[CONTACTO] Envío repetido de ${correo}, rechazado`);
      return res.status(429).json({ error: 'DEMASIADAS_SOLICITUDES' });
    }

    // Se guarda el contacto tal cual llegó, para tener el dato en bruto.
    const { data: contacto, error: errContacto } = await db
      .from('contactos')
      .insert({
        nombre,
        cargo,
        institucion,
        correo,
        telefono,
        cantidad_alumnos: cantidadAlumnos,
        plan_id: d.planId || null,
        plan_nombre: d.planNombre || null,
        estado: 'nuevo',
      })
      .select('id')
      .single();

    if (errContacto) throw errContacto;

    /**
     * Y se crea la solicitud, para que caiga en el panel de administración
     * junto a las demás. Nace sin dueño porque quien la envió todavía no
     * tiene cuenta: se le enlaza cuando se registre con este mismo correo.
     */
    let requierePago = true;
    let planNombre = d.planNombre || null;

    if (d.planId) {
      const { data: plan } = await db
        .from('planes')
        .select('nombre, requiere_pago')
        .eq('id', d.planId)
        .maybeSingle();

      if (plan) {
        requierePago = plan.requiere_pago !== false;
        planNombre = planNombre || plan.nombre;
      }
    }

    const { data: solicitud, error: errSolicitud } = await db
      .from('solicitudes')
      .insert({
        nombre_institucion: institucion,
        rbd: null,
        encargado: nombre,
        cargo,
        correo,
        telefono,
        cantidad_estudiantes: cantidadAlumnos,

        plan_id: d.planId || null,
        plan_nombre: planNombre,

        solicitante_id: null,
        origen: 'publico',

        estado: 'pendiente',
        monto: null,
        estado_pago: requierePago ? 'pendiente' : 'no_aplica',

        contacto_id: contacto.id,
      })
      .select('id')
      .single();

    if (errSolicitud) throw errSolicitud;

    console.log(
      `[CONTACTO] Nueva solicitud de ${institucion} (${correo}) · solicitud ${solicitud.id}`
    );

    return res.json({ id: contacto.id, solicitudId: solicitud.id });
  } catch (err) {
    console.error('[CONTACTO] Error guardando:', err.message);
    return res.status(500).json({ error: 'ERROR_INTERNO' });
  }
}

module.exports = { crearContacto };
