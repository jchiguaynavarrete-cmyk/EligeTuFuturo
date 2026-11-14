import { Injectable, inject } from '@angular/core';
import { Session, User } from '@supabase/supabase-js';
import { BehaviorSubject, Observable } from 'rxjs';

import { SupabaseClientService } from '../core/supabase.client';

/** Datos que el registro guarda junto a la cuenta. */
export interface DatosRegistro {
  nombre: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  rut: string;
  rutLimpio: string;
  fechaNacimiento: string;
  edad: number;
}

/**
 * Autenticación con Supabase.
 *
 * Mantiene la misma forma que tenía la versión con Firebase —`user$`,
 * `login`, `registrar`, `logout`— para que las páginas cambien lo menos
 * posible.
 *
 * Diferencia importante: el perfil ya no se crea desde el navegador. Los
 * datos del registro viajan como metadatos de la cuenta y un disparador
 * en la base crea la fila en `perfiles`. Así no puede quedar una cuenta
 * sin perfil si el navegador se cierra a medio camino, que es justo lo
 * que ocurría con el registro pendiente en localStorage.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private supabase = inject(SupabaseClientService).cliente;

  private usuarioActual = new BehaviorSubject<User | null>(null);
  user$: Observable<User | null> = this.usuarioActual.asObservable();

  private sesionActual: Session | null = null;

  constructor() {
    // Sesión guardada de una visita anterior.
    this.supabase.auth.getSession().then(({ data }) => {
      this.sesionActual = data.session;
      this.usuarioActual.next(data.session?.user ?? null);
    });

    this.supabase.auth.onAuthStateChange((_evento, sesion) => {
      this.sesionActual = sesion;
      this.usuarioActual.next(sesion?.user ?? null);
    });
  }

  /**
   * Crea la cuenta. Los datos del perfil van como metadatos y el
   * disparador `al_crear_usuario` los convierte en una fila de `perfiles`.
   */
  async registrar(email: string, password: string, datos: DatosRegistro) {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nombre: datos.nombre,
          nombres: datos.nombres,
          apellido_paterno: datos.apellidoPaterno,
          apellido_materno: datos.apellidoMaterno,
          rut: datos.rut,
          rut_limpio: datos.rutLimpio,
          fecha_nacimiento: datos.fechaNacimiento,
          edad: datos.edad,
        },
        emailRedirectTo: `${window.location.origin}/auth`,
      },
    });

    if (error) throw error;
    return data;
  }

  async login(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    return data;
  }

  async logout(): Promise<void> {
    const { error } = await this.supabase.auth.signOut();
    if (error) throw error;
  }

  /** Envía el correo para definir una contraseña nueva. */
  async recuperarPassword(email: string): Promise<void> {
    const { error } = await this.supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: `${window.location.origin}/auth` }
    );

    if (error) throw error;
  }

  /** Reenvía el correo de verificación. */
  async enviarVerificacion(email?: string): Promise<void> {
    const destino = email ?? this.usuarioActual.value?.email;
    if (!destino) throw new Error('No hay correo al que enviar la verificación');

    const { error } = await this.supabase.auth.resend({
      type: 'signup',
      email: destino,
      options: { emailRedirectTo: `${window.location.origin}/auth` },
    });

    if (error) throw error;
  }

  async recargarUsuario(): Promise<void> {
    const { data } = await this.supabase.auth.getUser();
    this.usuarioActual.next(data.user ?? null);
  }

  getUid(): string | null {
    return this.usuarioActual.value?.id ?? null;
  }

  getCurrentUser(): User | null {
    return this.usuarioActual.value;
  }

  /**
   * Si el correo está confirmado.
   *
   * Supabase lo marca con `email_confirmed_at`. Cuando la confirmación
   * por correo está desactivada en el proyecto, la cuenta nace confirmada.
   */
  correoVerificado(): boolean {
    return !!this.usuarioActual.value?.email_confirmed_at;
  }

  /** Token para autenticar las llamadas al backend de pagos. */
  async getToken(): Promise<string | null> {
    if (this.sesionActual?.access_token) return this.sesionActual.access_token;

    const { data } = await this.supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  /** Traduce los errores de Supabase a mensajes entendibles. */
  mensajeDeError(error: any): string {
    const msg = (error?.message || '').toLowerCase();

    if (msg.includes('invalid login credentials')) {
      return 'Correo o contraseña incorrectos.';
    }
    if (msg.includes('already registered') || msg.includes('already been registered')) {
      return 'Este correo ya está registrado. Intenta iniciar sesión.';
    }
    if (msg.includes('email not confirmed')) {
      return 'Debes verificar tu correo antes de entrar. Revisa tu bandeja 📩';
    }
    if (msg.includes('invalid email')) {
      return 'El correo no es válido.';
    }
    if (msg.includes('rut_limpio') || msg.includes('duplicate key')) {
      return 'Este RUT ya está registrado.';
    }
    if (msg.includes('rate limit') || msg.includes('too many')) {
      return 'Demasiados intentos. Espera unos minutos.';
    }

    return 'Ocurrió un error. Intenta nuevamente.';
  }
}
