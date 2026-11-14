const express = require('express');
const { requiereSesion, requiereAdmin } = require('../middleware/auth');
const { crearPago, retornoWebpay } = require('../controllers/pagos.controller');
const { crearContacto } = require('../controllers/contacto.controller');
const {
  reclamarSolicitudes,
  activarSolicitud,
  habilitarCuenta,
} = require('../controllers/solicitudes.controller');
const { eliminarUsuario } = require('../controllers/usuarios.controller');

const router = express.Router();

/**
 * Formulario público de la landing institucional. Sin sesión a propósito:
 * quien evalúa contratar todavía no tiene cuenta. La validación y el freno
 * contra envíos repetidos están en el controlador.
 */
router.post('/contacto', crearContacto);

/**
 * Enlaza las solicitudes del formulario público con la cuenta que se acaba
 * de crear. Exige sesión: el correo se toma del token, no del cuerpo.
 */
router.post('/solicitudes/reclamar', requiereSesion, reclamarSolicitudes);

/**
 * Crea o habilita la cuenta de la institución al aprobar su solicitud.
 * Solo administración: el rol de institución no se puede auto-asignar.
 */
router.post('/solicitudes/habilitar-cuenta', requiereSesion, requiereAdmin, habilitarCuenta);

/**
 * Elimina una cuenta por completo. Solo administración: borrar en
 * Supabase Auth exige la llave de servicio, que no viaja al navegador.
 */
router.delete('/usuarios/:id', requiereSesion, requiereAdmin, eliminarUsuario);

/** Activa un plan sin pago (el Piloto). Solo administración. */
router.post('/solicitudes/activar', requiereSesion, requiereAdmin, activarSolicitud);

// Crear la transacción: exige sesión, porque se valida el dueño de la solicitud.
router.post('/pagos/crear', requiereSesion, crearPago);

/**
 * Retorno de Webpay. No lleva sesión: quien llega aquí es el navegador
 * devuelto por Transbank. La seguridad está en el token, que se confirma
 * contra Transbank antes de dar nada por pagado.
 *
 * Transbank puede usar POST o GET según el caso, así que se aceptan ambos.
 */
router.post('/pagos/retorno', retornoWebpay);
router.get('/pagos/retorno', retornoWebpay);

module.exports = router;
