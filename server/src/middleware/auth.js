const { auth } = require('../config/firebase');

/**
 * Verifica el token de Firebase que envía el frontend.
 *
 * Sin esto cualquiera podría pedir la creación de un pago para una
 * solicitud ajena: el uid no puede venir del cuerpo de la petición.
 */
async function requiereSesion(req, res, next) {
  const cabecera = req.headers.authorization || '';
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'SIN_SESION' });
  }

  try {
    const decodificado = await auth.verifyIdToken(token);

    if (!decodificado.email_verified) {
      return res.status(403).json({ error: 'CORREO_NO_VERIFICADO' });
    }

    req.usuario = { uid: decodificado.uid, email: decodificado.email };
    return next();
  } catch (err) {
    console.error('[AUTH] Token inválido:', err.message);
    return res.status(401).json({ error: 'SIN_SESION' });
  }
}

module.exports = { requiereSesion };
