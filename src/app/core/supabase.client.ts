import { Injectable } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';

import { environment } from 'src/environments/environment';

/**
 * Lo que traía la dirección al abrir la app.
 *
 * Se lee al cargar el módulo, antes de crear el cliente, porque Supabase
 * consume el hash del enlace del correo y lo borra apenas lo valida.
 * Después ya no queda forma de saber que la persona llegó desde
 * "¿Olvidaste tu contraseña?" ni de mostrarle por qué falló un enlace.
 */
const PARAMS_AL_ABRIR = new URLSearchParams(
  typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : ''
);

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

  /** La persona abrió el enlace del correo de recuperación de contraseña. */
  readonly llegoPorRecuperacion =
    PARAMS_AL_ABRIR.get('type') === 'recovery' && PARAMS_AL_ABRIR.has('access_token');

  /** Código de error si el enlace del correo venció o ya se había usado. */
  readonly errorDelEnlace: string | null =
    PARAMS_AL_ABRIR.get('error_code') || PARAMS_AL_ABRIR.get('error');

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
