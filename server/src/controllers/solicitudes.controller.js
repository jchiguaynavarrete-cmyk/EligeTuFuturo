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

module.exports = { reclamarSolicitudes, activarSolicitud };
