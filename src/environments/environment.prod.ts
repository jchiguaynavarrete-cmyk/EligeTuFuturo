
export const environment = {
  production: true,

  /**
   * Supabase. Estas dos credenciales son públicas por diseño: van en el
   * navegador y la protección real la dan las políticas RLS.
   * La clave secreta NUNCA va aquí: vive en server/.env.
   */
  supabase: {
    url: 'https://zlhkflzocjbanvnifkws.supabase.co',
    anonKey: 'sb_publishable_AjXx0pl6L5HVtS1tpaMsnw_ulC22-jy',
  },

  /** Backend de pagos desplegado. Cambiar por la URL real al publicar. */
  apiPagosUrl: 'https://TU-BACKEND.onrender.com/api',
};

