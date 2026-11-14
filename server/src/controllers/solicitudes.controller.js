const { db } = require('../config/firebase');

/**
 * POST /api/solicitudes/reclamar
 *
 * Enlaza a la cuenta recién creada las solicitudes que llegaron por el
 * formulario público con ese mismo correo.
 *
 * El correo NO se recibe del cuerpo de la petición: se toma del token de
 * Firebase, que ya está verificado. Si viniera del navegador, cualquiera
 * podría reclamar las solicitudes de otra institución escribiendo su correo.
 */
async function reclamarSolicitudes(req, res) {
  const { uid, email } = req.usuario;

  if (!email) {
    return res.status(400).json({ error: 'SIN_CORREO' });
  }

  try {
    const huerfanas = await db
      .collection('solicitudes')
      .where('correo', '==', email.toLowerCase())
      .where('uidSolicitante', '==', null)
      .get();

    if (huerfanas.empty) {
      return res.json({ enlazadas: 0 });
    }

    const lote = db.batch();
    huerfanas.docs.forEach((d) => lote.update(d.ref, { uidSolicitante: uid }));
    await lote.commit();

    console.log(
      `[SOLICITUDES] ${huerfanas.size} solicitud(es) enlazadas a ${email}`
    );

    return res.json({ enlazadas: huerfanas.size });
  } catch (err) {
    console.error('[SOLICITUDES] Error al enlazar:', err.message);
    return res.status(500).json({ error: 'ERROR_INTERNO' });
  }
}

module.exports = { reclamarSolicitudes };
