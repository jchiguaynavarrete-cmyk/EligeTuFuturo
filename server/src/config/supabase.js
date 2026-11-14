const { createClient } = require('@supabase/supabase-js');

/**
 * Cliente de Supabase con la clave de servicio.
 *
 * Esta clave se salta las políticas RLS, así que vive solo aquí: es el
 * único lugar donde se pueden escribir los campos sensibles —el estado
 * de pago, el monto pagado, la activación del plan— sin confiar en lo
 * que diga el navegador.
 */

const { leer, leerUrl } = require('./entorno');

const URL = leerUrl('SUPABASE_URL');
const CLAVE_SERVICIO = leer('SUPABASE_SECRET_KEY');

if (!URL || !CLAVE_SERVICIO) {
  throw new Error(
    'Faltan SUPABASE_URL o SUPABASE_SECRET_KEY. Revisa server/.env ' +
      '(hay una plantilla en .env.example).'
  );
}

const db = createClient(URL, CLAVE_SERVICIO, {
  auth: { persistSession: false, autoRefreshToken: false },
});

module.exports = { db, URL };
