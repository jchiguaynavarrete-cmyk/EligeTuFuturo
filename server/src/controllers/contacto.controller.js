const { admin, db } = require('../config/firebase');

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
    const desde = admin.firestore.Timestamp.fromMillis(
      Date.now() - MINUTOS_ENTRE_ENVIOS * 60 * 1000
    );

    const recientes = await db
      .collection('contactos')
      .where('correo', '==', correo)
      .where('creadoEn', '>', desde)
      .limit(1)
      .get();

    if (!recientes.empty) {
      console.log(`[CONTACTO] Envío repetido de ${correo}, rechazado`);
      return res.status(429).json({ error: 'DEMASIADAS_SOLICITUDES' });
    }

    // Guarda el contacto tal cual llegó, para tener el dato en bruto.
    const ref = db.collection('contactos').doc();
    await ref.set({
      nombre,
      cargo,
      institucion,
      correo,
      telefono,
      cantidadAlumnos,

      planId: d.planId || null,
      planNombre: d.planNombre || null,

      estado: 'nuevo',
      creadoEn: admin.firestore.FieldValue.serverTimestamp(),
    });

    /**
     * Y crea la solicitud, para que caiga en el panel de administración
     * junto a las demás. Nace sin dueño porque quien la envió todavía no
     * tiene cuenta: se le enlaza cuando se registre con este mismo correo.
     */
    const plan = d.planId
      ? (await db.collection('planes').doc(d.planId).get()).data()
      : null;

    const requierePago = plan ? plan.requierePago !== false : true;

    const solRef = db.collection('solicitudes').doc();
    await solRef.set({
      nombreInstitucion: institucion,
      rbd: '',
      encargado: nombre,
      cargo,
      correo,
      telefono,
      cantidadEstudiantes: cantidadAlumnos,

      planId: d.planId || null,
      planNombre: d.planNombre || (plan ? plan.nombre : null),

      uidSolicitante: null,
      origen: 'publico',

      estado: 'pendiente',
      fechaSolicitud: admin.firestore.FieldValue.serverTimestamp(),
      fechaResolucion: null,
      adminUid: null,
      motivoRechazo: null,

      monto: null,
      estadoPago: requierePago ? 'pendiente' : 'no_aplica',
      pagoId: null,

      contactoId: ref.id,
    });

    console.log(
      `[CONTACTO] Nueva solicitud de ${institucion} (${correo}) · solicitud ${solRef.id}`
    );

    return res.json({ id: ref.id, solicitudId: solRef.id });
  } catch (err) {
    console.error('[CONTACTO] Error guardando:', err.message);
    return res.status(500).json({ error: 'ERROR_INTERNO' });
  }
}

module.exports = { crearContacto };
