import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';

export interface DatosContacto {
  nombre: string;
  cargo: string;
  institucion: string;
  correo: string;
  telefono: string;
  cantidadAlumnos: number;
  planId: string | null;
  planNombre: string | null;
}

/**
 * Envía el formulario público de contacto institucional.
 *
 * Va al backend en vez de escribir en la base: el formulario no exige
 * sesión, y abrir escritura anónima permitiría llenar la base de basura.
 * El backend valida y guarda con el Admin SDK.
 */
@Injectable({ providedIn: 'root' })
export class ContactoService {
  private readonly api = environment.apiPagosUrl;

  async enviar(datos: DatosContacto): Promise<{ id: string }> {
    let respuesta: Response;

    try {
      respuesta = await fetch(`${this.api}/contacto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos),
      });
    } catch {
      throw new Error('SIN_CONEXION');
    }

    const cuerpo = await respuesta.json().catch(() => ({}));

    if (!respuesta.ok) {
      throw new Error((cuerpo as any)?.error || 'ERROR_BACKEND');
    }

    return cuerpo as { id: string };
  }

  mensajeDeError(codigo: string): string {
    const mensajes: Record<string, string> = {
      SIN_CONEXION:
        'No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.',
      DATOS_INVALIDOS: 'Revisa los datos del formulario.',
      DEMASIADAS_SOLICITUDES:
        'Ya recibimos una solicitud tuya hace poco. Te contactaremos pronto.',
    };

    return mensajes[codigo] ?? 'No pudimos enviar el formulario. Intenta nuevamente.';
  }
}
