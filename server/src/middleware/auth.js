const { db } = require('../config/supabase');

/**
 * Verifica el token de Supabase que envía el frontend.
 *
 * Sin esto cualquiera podría pedir la creación de un pago para una
 * solicitud ajena: el uid y el correo no pueden venir del cuerpo de la
 * petición, se toman del token ya verificado.
 */
async function requiereSesion(req, res, next) {
  const cabecera = req.headers.authorization || '';
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'SIN_SESION' });
  }

  try {
    const { data, error } = await db.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ error: 'SIN_SESION' });
    }

    const usuario = data.user;

    // Si el proyecto exige confirmar el correo, aquí se corta.
    if (!usuario.email_confirmed_at) {
      return res.status(403).json({ error: 'CORREO_NO_VERIFICADO' });
    }

    req.usuario = { uid: usuario.id, email: usuario.email };
    return next();
  } catch (err) {
    console.error('[AUTH] Token inválido:', err.message);
    return res.status(401).json({ error: 'SIN_SESION' });
  }
}

/** Para los endpoints que solo puede usar un administrador. */
async function requiereAdmin(req, res, next) {
  const { data, error } = await db
    .from('perfiles')
    .select('rol')
    .eq('id', req.usuario.uid)
    .maybeSingle();

  if (error || data?.rol !== 'admin') {
    return res.status(403).json({ error: 'SIN_PERMISO' });
  }

  return next();
}

module.exports = { requiereSesion, requiereAdmin };
