const { WebpayPlus, Options, IntegrationApiKeys, Environment, IntegrationCommerceCodes } =
  require('transbank-sdk');

/**
 * Configuración de Transbank.
 *
 * Este proyecto es académico: solo se usa el ambiente de INTEGRACIÓN, que
 * trabaja con tarjetas de prueba y no mueve dinero real. La rama de
 * producción queda escrita pero deshabilitada a propósito.
 */

const { leer } = require('./entorno');

const AMBIENTE = leer('TBK_ENVIRONMENT', 'integration').toLowerCase();

if (AMBIENTE !== 'integration') {
  throw new Error(
    'Solo está habilitado el ambiente de integración. ' +
      'Producción requiere credenciales comerciales reales y una revisión aparte.'
  );
}

/**
 * Credenciales públicas de integración de Transbank para Webpay Plus.
 * Se pueden sobrescribir por variables de entorno, pero no son secretas:
 * Transbank las publica para que cualquiera pueda probar.
 */
const COMMERCE_CODE =
  leer('TBK_COMMERCE_CODE', IntegrationCommerceCodes.WEBPAY_PLUS);

const API_KEY = leer('TBK_API_KEY', IntegrationApiKeys.WEBPAY);

/** Devuelve una transacción lista para operar contra integración. */
function crearTransaccion() {
  return new WebpayPlus.Transaction(
    new Options(COMMERCE_CODE, API_KEY, Environment.Integration)
  );
}

module.exports = {
  crearTransaccion,
  AMBIENTE,
  COMMERCE_CODE,
};
