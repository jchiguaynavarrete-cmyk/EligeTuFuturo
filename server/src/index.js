require('dotenv').config();

const express = require('express');
const cors = require('cors');

const pagosRoutes = require('./routes/pagos.routes');
const { AMBIENTE, COMMERCE_CODE } = require('./config/transbank');

const app = express();
const PUERTO = process.env.PORT || 3000;

/** Orígenes autorizados: la app local y la desplegada en Render. */
const origenes = (process.env.CORS_ORIGINS ||
  'http://localhost:8101,http://localhost:4200,https://eligetufuturo-app.onrender.com')
  .split(',')
  .map((o) => o.trim());

/*
 * Un origen no autorizado es un rechazo esperado, no un error interno:
 * se responde 403 antes de llegar a CORS para que no aparezca como 500
 * en los registros.
 */
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !origenes.includes(origin)) {
    return res.status(403).json({ error: 'ORIGEN_NO_AUTORIZADO' });
  }
  return next();
});

app.use(
  cors({
    origin(origin, callback) {
      // Sin origin: peticiones del propio servidor o el retorno de Webpay.
      if (!origin || origenes.includes(origin)) return callback(null, true);
      return callback(new Error('ORIGEN_NO_AUTORIZADO'));
    },
  })
);

app.use(express.json());
// Webpay devuelve el token como formulario, no como JSON.
app.use(express.urlencoded({ extended: false }));

app.get('/api/salud', (_req, res) => {
  res.json({
    ok: true,
    ambiente: AMBIENTE,
    commerceCode: COMMERCE_CODE,
    nota: 'Ambiente de integración: no se procesan pagos reales.',
  });
});

app.use('/api', pagosRoutes);

// Cualquier error no controlado sale como mensaje genérico, nunca como traza.
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'ERROR_INTERNO' });
});

app.listen(PUERTO, () => {
  console.log('');
  console.log('  EligeTuFuturo · backend de pagos');
  console.log(`  Escuchando en http://localhost:${PUERTO}`);
  console.log(`  Ambiente Transbank: ${AMBIENTE.toUpperCase()}`);
  console.log('  No se procesan pagos reales.');
  console.log('');
});
