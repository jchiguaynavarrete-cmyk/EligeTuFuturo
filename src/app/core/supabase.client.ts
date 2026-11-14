import { Injectable } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';

import { environment } from 'src/environments/environment';

/**
 * Cliente único de Supabase.
 *
 * Se crea una sola instancia para toda la app: cada `createClient` abre su
 * propia conexión de tiempo real y su propio manejo de sesión, así que
 * tener varias provoca sesiones que se pisan entre sí.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseClientService {
  readonly cliente: SupabaseClient;

  constructor() {
    this.cliente = createClient(
      environment.supabase.url,
      environment.supabase.anonKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }
    );
  }
}
