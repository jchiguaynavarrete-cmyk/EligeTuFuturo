const { admin, db } = require('../config/firebase');
const { crearTransaccion } = require('../config/transbank');

const URL_FRONTEND = process.env.FRONTEND_URL || 'http://localhost:8101';
const URL_RETORNO =
  process.env.TBK_RETURN_URL || 'http://localhost:3000/api/pagos/retorno';

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
 * se lee de la solicitud en Firestore, que solo el administrador puede fijar.
 */
async function crearPago(req, res) {
  const { solicitudId } = req.body || {};
  const { uid } = req.usuario;

  if (!solicitudId) {
    return res.status(400).json({ error: 'SOLICITUD_NO_ENCONTRADA' });
  }

  try {
    const ref = db.collection('solicitudes').doc(solicitudId);
    const snap = await ref.get();

    if (!snap.exists) {
      return res.status(404).json({ error: 'SOLICITUD_NO_ENCONTRADA' });
    }

    const solicitud = snap.data();

    // Solo el dueño de la solicitud puede pagarla.
    if (solicitud.uidSolicitante !== uid) {
      return res.status(403).json({ error: 'SIN_PERMISO' });
    }

    if (solicitud.estado !== 'aprobada') {
      return res.status(409).json({ error: 'SOLICITUD_NO_APROBADA' });
    }

    if (solicitud.estadoPago === 'pagado') {
      return res.status(409).json({ error: 'PAGO_YA_AUTORIZADO' });
    }

    const monto = Number(solicitud.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      return res.status(409).json({ error: 'MONTO_NO_ASIGNADO' });
    }

    // Idempotencia: si ya hay un pago autorizado para esta solicitud, no se crea otro.
    const autorizados = await db
      .collection('pagos')
      .where('solicitudId', '==', solicitudId)
      .where('estado', '==', 'autorizado')
      .limit(1)
      .get();

    if (!autorizados.empty) {
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

    const pagoRef = db.collection('pagos').doc();
    await pagoRef.set({
      solicitudId,
      uidSolicitante: uid,
      buyOrder,
      sessionId,
      amount: monto,
      token: respuesta.token,
      estado: 'iniciado',
      authorizationCode: null,
      paymentTypeCode: null,
      responseCode: null,
      transactionDate: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

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

  // Anulación: la persona apretó "Anular compra" en Webpay.
  if (tokenAnulado && !tokenWs) {
    console.log('[WEBPAY] Pago anulado por el usuario');
    await marcarPorToken(tokenAnulado, { estado: 'cancelado' });
    return redirigir(res, { resultado: 'cancelado' });
  }

  if (!tokenWs) {
    console.error('[WEBPAY] Retorno sin token');
    return redirigir(res, { resultado: 'error', motivo: 'TOKEN_INVALIDO' });
  }

  try {
    const pagoSnap = await buscarPagoPorToken(tokenWs);

    if (!pagoSnap) {
      console.error('[WEBPAY] Token desconocido');
      return redirigir(res, { resultado: 'error', motivo: 'TOKEN_INVALIDO' });
    }

    // Si ya se procesó, no se vuelve a confirmar.
    if (pagoSnap.data().estado !== 'iniciado') {
      console.log('[WEBPAY] Transacción ya procesada');
      return redirigir(res, {
        resultado: pagoSnap.data().estado === 'autorizado' ? 'ok' : 'rechazado',
        pagoId: pagoSnap.id,
      });
    }

    console.log('[WEBPAY] Confirmando transacción');

    const transaccion = crearTransaccion();
    const r = await transaccion.commit(tokenWs);

    const autorizado = r.response_code === 0 && r.status === 'AUTHORIZED';

    await pagoSnap.ref.update({
      estado: autorizado ? 'autorizado' : 'rechazado',
      authorizationCode: r.authorization_code ?? null,
      paymentTypeCode: r.payment_type_code ?? null,
      responseCode: r.response_code ?? null,
      transactionDate: r.transaction_date ?? null,
      amount: r.amount ?? pagoSnap.data().amount,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (!autorizado) {
      console.log(`[WEBPAY] Transacción rechazada (código ${r.response_code})`);
      await db.collection('solicitudes').doc(pagoSnap.data().solicitudId).update({
        estadoPago: 'fallido',
      });
      return redirigir(res, { resultado: 'rechazado', pagoId: pagoSnap.id });
    }

    console.log('[WEBPAY] Transacción autorizada');
    await activarPlan(pagoSnap.data().solicitudId, pagoSnap.id);

    return redirigir(res, { resultado: 'ok', pagoId: pagoSnap.id });
  } catch (err) {
    console.error('[WEBPAY] Error confirmando transacción:', err.message);
    return redirigir(res, { resultado: 'error', motivo: 'ERROR_CONFIRMANDO' });
  }
}

async function buscarPagoPorToken(token) {
  const q = await db.collection('pagos').where('token', '==', token).limit(1).get();
  return q.empty ? null : q.docs[0];
}

async function marcarPorToken(token, cambios) {
  const snap = await buscarPagoPorToken(token);
  if (!snap) return;

  await snap.ref.update({
    ...cambios,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Marca la solicitud como pagada y deja el plan vigente.
 * Se hace aquí, en el backend, para que no dependa del navegador.
 */
async function activarPlan(solicitudId, pagoId) {
  const solicitudRef = db.collection('solicitudes').doc(solicitudId);
  const solicitudSnap = await solicitudRef.get();
  if (!solicitudSnap.exists) return;

  const s = solicitudSnap.data();

  const planSnap = await db.collection('planes').doc(s.planId).get();
  const duracionMeses = planSnap.exists ? planSnap.data().duracionMeses || 12 : 12;

  const inicio = new Date();
  const termino = new Date(inicio);
  termino.setMonth(termino.getMonth() + duracionMeses);

  await solicitudRef.update({
    estadoPago: 'pagado',
    pagoId,
  });

  await db.collection('instituciones').doc(s.uidSolicitante).set(
    {
      uid: s.uidSolicitante,
      nombreInstitucion: s.nombreInstitucion,
      rbd: s.rbd,
      correo: s.correo,
      planId: s.planId,
      planNombre: s.planNombre,
      estadoPlan: 'activo',
      solicitudId,
      fechaInicio: admin.firestore.Timestamp.fromDate(inicio),
      fechaTermino: admin.firestore.Timestamp.fromDate(termino),
    },
    { merge: true }
  );

  console.log(`[WEBPAY] Plan activado para ${s.nombreInstitucion}`);
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

module.exports = { crearPago, retornoWebpay };
