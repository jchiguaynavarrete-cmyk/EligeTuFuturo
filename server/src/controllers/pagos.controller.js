const { db } = require('../config/supabase');
const { crearTransaccion } = require('../config/transbank');
const { leerUrl } = require('../config/entorno');

const URL_FRONTEND = leerUrl('FRONTEND_URL', 'http://localhost:8101');
const URL_RETORNO = leerUrl(
  'TBK_RETURN_URL',
  'http://localhost:3000/api/pagos/retorno'
);

/** Orden de compra única y legible. Transbank la limita a 26 caracteres. */
function generarBuyOrder() {
  const aleatorio = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ETF-${Date.now().toString(36).toUpperCase()}-${aleatorio}`;
}

function generarSessionId(uid) {
  return `S-${uid.slice(0, 8)}-${Date.now().toString(36)}`;
}

/**
 * POST /api/pagos/crear
 *
 * Crea la transacción en Webpay. El monto NO llega desde el navegador:
 * se lee de la solicitud en la base, que solo el administrador puede fijar.
 */
async function crearPago(req, res) {
  const { solicitudId } = req.body || {};
  const { uid } = req.usuario;

  if (!solicitudId) {
    return res.status(400).json({ error: 'SOLICITUD_NO_ENCONTRADA' });
  }

  try {
    const { data: solicitud, error } = await db
      .from('solicitudes')
      .select('*')
      .eq('id', solicitudId)
      .maybeSingle();

    if (error) throw error;
    if (!solicitud) {
      return res.status(404).json({ error: 'SOLICITUD_NO_ENCONTRADA' });
    }

    // Solo el dueño de la solicitud puede pagarla.
    if (solicitud.solicitante_id !== uid) {
      return res.status(403).json({ error: 'SIN_PERMISO' });
    }

    if (solicitud.estado !== 'aprobada') {
      return res.status(409).json({ error: 'SOLICITUD_NO_APROBADA' });
    }

    if (solicitud.estado_pago === 'pagado') {
      return res.status(409).json({ error: 'PAGO_YA_AUTORIZADO' });
    }

    const monto = Number(solicitud.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      return res.status(409).json({ error: 'MONTO_NO_ASIGNADO' });
    }

    // Idempotencia: si ya hay un pago autorizado, no se crea otro.
    const { data: autorizados } = await db
      .from('pagos')
      .select('id')
      .eq('solicitud_id', solicitudId)
      .eq('estado', 'autorizado')
      .limit(1);

    if (autorizados && autorizados.length > 0) {
      return res.status(409).json({ error: 'PAGO_YA_AUTORIZADO' });
    }

    const buyOrder = generarBuyOrder();
    const sessionId = generarSessionId(uid);

    console.log('[WEBPAY] Creando transacción');
    console.log(`[WEBPAY] Orden: ${buyOrder} · Monto: ${monto}`);

    const transaccion = crearTransaccion();
    const respuesta = await transaccion.create(
      buyOrder,
      sessionId,
      monto,
      URL_RETORNO
    );

    console.log('[WEBPAY] Transacción creada');

    const { error: errPago } = await db.from('pagos').insert({
      solicitud_id: solicitudId,
      solicitante_id: uid,
      buy_order: buyOrder,
      session_id: sessionId,
      amount: monto,
      token: respuesta.token,
      estado: 'iniciado',
    });

    if (errPago) throw errPago;

    return res.json({
      url: respuesta.url,
      token: respuesta.token,
      buyOrder,
    });
  } catch (err) {
    console.error('[WEBPAY] Error creando transacción:', err.message);
    return res.status(500).json({ error: 'ERROR_CREANDO_TRANSACCION' });
  }
}

/**
 * Retorno desde Webpay (GET y POST).
 *
 * Transbank devuelve `token_ws` cuando se completó el formulario, o
 * `TBK_TOKEN` cuando la persona anuló el pago. Un pago NO se da por bueno
 * porque el navegador haya vuelto: hay que confirmarlo contra Transbank.
 */
async function retornoWebpay(req, res) {
  const datos = { ...req.query, ...req.body };
  const tokenWs = datos.token_ws;
  const tokenAnulado = datos.TBK_TOKEN;

  if (tokenAnulado && !tokenWs) {
    console.log('[WEBPAY] Pago anulado por el usuario');
    await db
      .from('pagos')
      .update({ estado: 'cancelado', actualizado_en: new Date().toISOString() })
      .eq('token', tokenAnulado);

    return redirigir(res, { resultado: 'cancelado' });
  }

  if (!tokenWs) {
    console.error('[WEBPAY] Retorno sin token');
    return redirigir(res, { resultado: 'error', motivo: 'TOKEN_INVALIDO' });
  }

  try {
    const { data: pago } = await db
      .from('pagos')
      .select('*')
      .eq('token', tokenWs)
      .maybeSingle();

    if (!pago) {
      console.error('[WEBPAY] Token desconocido');
      return redirigir(res, { resultado: 'error', motivo: 'TOKEN_INVALIDO' });
    }

    // Si ya se procesó, no se vuelve a confirmar.
    if (pago.estado !== 'iniciado') {
      console.log('[WEBPAY] Transacción ya procesada');
      return redirigir(res, {
        resultado: pago.estado === 'autorizado' ? 'ok' : 'rechazado',
        pagoId: pago.id,
      });
    }

    console.log('[WEBPAY] Confirmando transacción');

    const transaccion = crearTransaccion();
    const r = await transaccion.commit(tokenWs);

    const autorizado = r.response_code === 0 && r.status === 'AUTHORIZED';

    await db
      .from('pagos')
      .update({
        estado: autorizado ? 'autorizado' : 'rechazado',
        authorization_code: r.authorization_code ?? null,
        payment_type_code: r.payment_type_code ?? null,
        response_code: r.response_code ?? null,
        transaction_date: r.transaction_date ?? null,
        amount: r.amount ?? pago.amount,
        actualizado_en: new Date().toISOString(),
      })
      .eq('id', pago.id);

    if (!autorizado) {
      console.log(`[WEBPAY] Transacción rechazada (código ${r.response_code})`);
      await db
        .from('solicitudes')
        .update({ estado_pago: 'fallido' })
        .eq('id', pago.solicitud_id);

      return redirigir(res, { resultado: 'rechazado', pagoId: pago.id });
    }

    console.log('[WEBPAY] Transacción autorizada');
    await activarPlanDeSolicitud(pago.solicitud_id, pago.id);

    return redirigir(res, { resultado: 'ok', pagoId: pago.id });
  } catch (err) {
    console.error('[WEBPAY] Error confirmando transacción:', err.message);
    return redirigir(res, { resultado: 'error', motivo: 'ERROR_CONFIRMANDO' });
  }
}

/**
 * Marca la solicitud como pagada y deja el plan vigente.
 * Se hace aquí, en el backend, para que no dependa del navegador.
 */
async function activarPlanDeSolicitud(solicitudId, pagoId) {
  const { data: s } = await db
    .from('solicitudes')
    .select('*')
    .eq('id', solicitudId)
    .maybeSingle();

  if (!s) return;

  const { data: plan } = await db
    .from('planes')
    .select('duracion_meses')
    .eq('id', s.plan_id)
    .maybeSingle();

  const duracionMeses = plan?.duracion_meses || 12;

  const inicio = new Date();
  const termino = new Date(inicio);
  termino.setMonth(termino.getMonth() + duracionMeses);

  const cambios = { estado_pago: 'pagado' };
  if (pagoId) cambios.pago_id = pagoId;

  await db.from('solicitudes').update(cambios).eq('id', solicitudId);

  await db.from('instituciones').upsert(
    {
      id: s.solicitante_id,
      nombre_institucion: s.nombre_institucion,
      rbd: s.rbd,
      correo: s.correo,
      plan_id: s.plan_id,
      plan_nombre: s.plan_nombre,
      estado_plan: 'activo',
      solicitud_id: solicitudId,
      fecha_inicio: inicio.toISOString(),
      fecha_termino: termino.toISOString(),
    },
    { onConflict: 'id' }
  );

  console.log(`[WEBPAY] Plan activado para ${s.nombre_institucion}`);
}

/** Devuelve a la app con el resultado en la URL. */
function redirigir(res, params) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v != null)
  ).toString();

  return res.redirect(
    302,
    `${URL_FRONTEND}/tabs/institucion/pago-confirmado?${query}`
  );
}

module.exports = { crearPago, retornoWebpay, activarPlanDeSolicitud };
