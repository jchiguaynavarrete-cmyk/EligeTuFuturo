import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';

import { SupabaseClientService } from '../core/supabase.client';
import { AuthService } from './auth.service';

import { environment } from 'src/environments/environment';
import { Pago } from '../models/planes.model';

export interface RespuestaCrearPago {
  url: string;
  token: string;
  buyOrder: string;
}

/** Resultado que el backend pone en la URL al devolver desde Webpay. */
export type ResultadoRetorno = 'ok' | 'rechazado' | 'cancelado' | 'error';

/**
 * Puente con el backend de pagos.
 *
 * El frontend nunca habla con Transbank ni conoce la API Key: solo pide al
 * backend que cree la transacción y lo redirige al formulario de Webpay.
 * El monto tampoco se envía desde aquí; el backend lo lee de la base.
 */
@Injectable({ providedIn: 'root' })
export class PagosService {
  private supabase = inject(SupabaseClientService).cliente;
  private authService = inject(AuthService);
  private readonly api = environment.apiPagosUrl;

  /** El backend valida el token para saber quién pide el pago. */
  private async cabeceras(): Promise<HeadersInit> {
    const token = await this.authService.getToken();
    if (!token) throw new Error('SIN_SESION');

    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }

  private async pedir<T>(ruta: string, cuerpo: unknown): Promise<T> {
    let respuesta: Response;

    try {
      respuesta = await fetch(`${this.api}${ruta}`, {
        method: 'POST',
        headers: await this.cabeceras(),
        body: JSON.stringify(cuerpo),
      });
    } catch {
      // fetch solo falla así cuando no hay red o el backend no responde.
      throw new Error('SIN_CONEXION');
    }

    const datos = await respuesta.json().catch(() => ({}));

    if (!respuesta.ok) {
      throw new Error((datos as any)?.error || 'ERROR_BACKEND');
    }

    return datos as T;
  }

  /** Crea la transacción y devuelve la URL de Webpay a la que redirigir. */
  crearPago(solicitudId: string): Promise<RespuestaCrearPago> {
    return this.pedir<RespuestaCrearPago>('/pagos/crear', { solicitudId });
  }

  /**
   * Lee un pago ya procesado.
   *
   * La confirmación contra Transbank la hace el backend en su URL de retorno;
   * aquí solo se consulta el resultado que quedó guardado.
   */
  getPago(pagoId: string): Observable<Pago | null> {
    const consulta = this.supabase
      .from('pagos')
      .select('*')
      .eq('id', pagoId)
      .maybeSingle();

    return from(consulta).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) return null;

        // Los nombres de columna de PostgreSQL a los que usan las páginas.
        return {
          id: data.id,
          solicitudId: data.solicitud_id,
          uidSolicitante: data.solicitante_id,
          buyOrder: data.buy_order,
          sessionId: data.session_id,
          amount: data.amount,
          token: data.token,
          estado: data.estado,
          authorizationCode: data.authorization_code,
          paymentTypeCode: data.payment_type_code,
          responseCode: data.response_code,
          transactionDate: data.transaction_date,
          createdAt: data.creado_en,
          updatedAt: data.actualizado_en,
        } as Pago;
      })
    );
  }

  /**
   * Envía al formulario de Webpay.
   *
   * Transbank espera el token por POST, así que se arma un formulario y se
   * envía. No se puede hacer con una simple redirección por URL.
   */
  redirigirAWebpay(url: string, token: string): void {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = url;

    const campo = document.createElement('input');
    campo.type = 'hidden';
    campo.name = 'token_ws';
    campo.value = token;

    form.appendChild(campo);
    document.body.appendChild(form);
    form.submit();
  }

  /** Mensajes entendibles para la persona; los detalles quedan en consola. */
  mensajeDeError(codigo: string): string {
    const mensajes: Record<string, string> = {
      SIN_SESION: 'Tu sesión expiró. Vuelve a iniciar sesión.',
      SIN_CONEXION: 'No pudimos conectar con el servidor de pagos. Revisa tu conexión.',
      SOLICITUD_NO_ENCONTRADA: 'No encontramos la solicitud.',
      SOLICITUD_NO_APROBADA: 'La solicitud todavía no está aprobada.',
      MONTO_NO_ASIGNADO: 'El administrador aún no define el monto a pagar.',
      PAGO_YA_AUTORIZADO: 'Esta solicitud ya fue pagada.',
      SIN_PERMISO: 'No tienes permiso para pagar esta solicitud.',
      TOKEN_INVALIDO: 'El pago no se pudo verificar. Intenta nuevamente.',
      TRANSACCION_YA_PROCESADA: 'Esta transacción ya fue procesada.',
      PAGO_RECHAZADO: 'El pago fue rechazado. Puedes intentar con otro medio.',
    };

    return mensajes[codigo] ?? 'Ocurrió un problema al procesar el pago.';
  }
}
