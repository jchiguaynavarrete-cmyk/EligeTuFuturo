import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from '../core/supabase.client';
import { AuthService } from './auth.service';

/** Un hito del proceso PAES. */
export interface FechaPaes {
  id: number;
  titulo: string;
  descripcion: string | null;
  fecha: string; // 'aaaa-mm-dd'
  orden: number;
  activa: boolean;
}

/**
 * Las fechas del proceso PAES.
 *
 * Antes vivían escritas a mano dentro de la pantalla, así que cambiarlas
 * exigía tocar el programa. Ahora están en la base y las edita quien
 * administra, sin volver a publicar la aplicación.
 */
@Injectable({ providedIn: 'root' })
export class FechasPaesService {
  private supabase = inject(SupabaseClientService).cliente;
  private authService = inject(AuthService);

  /** Las vigentes, en el orden en que deben mostrarse. */
  async listar(): Promise<FechaPaes[]> {
    const { data, error } = await this.supabase
      .from('fechas_paes')
      .select('*')
      .eq('activa', true)
      .order('orden', { ascending: true })
      .order('fecha', { ascending: true });

    if (error) throw error;
    return (data ?? []) as FechaPaes[];
  }

  /** Todas, incluidas las ocultas. Para la pantalla de administración. */
  async listarTodas(): Promise<FechaPaes[]> {
    const { data, error } = await this.supabase
      .from('fechas_paes')
      .select('*')
      .order('orden', { ascending: true })
      .order('fecha', { ascending: true });

    if (error) throw error;
    return (data ?? []) as FechaPaes[];
  }

  /**
   * Cambia una fecha.
   *
   * Pide la fila de vuelta y falla si no cambió ninguna: cuando las
   * reglas de seguridad bloquean una actualización, la base responde
   * que todo salió bien y no modifica nada.
   */
  async actualizar(id: number, cambios: Partial<FechaPaes>): Promise<void> {
    const { data, error } = await this.supabase
      .from('fechas_paes')
      .update({
        ...cambios,
        actualizado_en: new Date().toISOString(),
        actualizado_por: this.authService.getUid(),
      })
      .eq('id', id)
      .select('id');

    if (error) throw error;

    if (!data || data.length === 0) {
      throw new Error(
        'La base no aplicó el cambio. Solo un administrador puede editar las fechas.'
      );
    }
  }

  async crear(fecha: Omit<FechaPaes, 'id' | 'activa'>): Promise<void> {
    const { error } = await this.supabase.from('fechas_paes').insert({
      ...fecha,
      actualizado_por: this.authService.getUid(),
    });

    if (error) throw error;
  }

  async eliminar(id: number): Promise<void> {
    const { error } = await this.supabase
      .from('fechas_paes')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
}
