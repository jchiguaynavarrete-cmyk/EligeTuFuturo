const { db } = require('../config/supabase');

/**
 * DELETE /api/usuarios/:id
 *
 * Borra una cuenta por completo. Va por el backend porque borrar en
 * Supabase Auth exige la llave de servicio, que nunca viaja al navegador.
 *
 * Lo que se lleva por delante, según las reglas de la base:
 *   - su perfil y sus carreras favoritas
 *   - su institución, si la tenía, con el plan vigente incluido
 *
 * Lo que NO se borra, a propósito:
 *   - las solicitudes que envió, que quedan sin titular
 *   - los pagos registrados, que son el respaldo de una transacción real
 */
async function eliminarUsuario(req, res) {
  const { id } = req.params;
  const { uid } = req.usuario;

  if (!id) {
    return res.status(400).json({ error: 'USUARIO_NO_ENCONTRADO' });
  }

  /*
   * Nadie se borra a sí mismo. Suena obvio, pero es el error más fácil de
   * cometer en una lista donde uno también aparece, y deja al
   * administrador fuera de su propio sistema.
   */
  if (id === uid) {
    return res.status(409).json({ error: 'NO_PUEDES_BORRARTE' });
  }

  try {
    const { data: perfil } = await db
      .from('perfiles')
      .select('rol, nombre, email')
      .eq('id', id)
      .maybeSingle();

    if (!perfil) {
      return res.status(404).json({ error: 'USUARIO_NO_ENCONTRADO' });
    }

    /*
     * Si es el último administrador, no se borra: quedarían usuarios,
     * solicitudes y planes sin nadie que pueda gestionarlos, y recuperar
     * el acceso exigiría entrar a la base a mano.
     */
    if (perfil.rol === 'admin') {
      const { count } = await db
        .from('perfiles')
        .select('*', { count: 'exact', head: true })
        .eq('rol', 'admin');

      if ((count ?? 0) <= 1) {
        return res.status(409).json({ error: 'ULTIMO_ADMINISTRADOR' });
      }
    }

    const { error } = await db.auth.admin.deleteUser(id);
    if (error) throw error;

    console.log(`[USUARIOS] Cuenta eliminada: ${perfil.email}`);

    return res.json({ eliminado: true, email: perfil.email });
  } catch (err) {
    console.error('[USUARIOS] Error al eliminar:', err.message);
    return res.status(500).json({ error: 'ERROR_ELIMINANDO' });
  }
}

module.exports = { eliminarUsuario };
