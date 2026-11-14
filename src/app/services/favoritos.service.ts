import { Injectable, inject } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { SupabaseClientService } from '../core/supabase.client';
import { AuthService } from './auth.service';
import { CarreraDoc } from './carreras.service';

/**
 * Favoritos de cada persona.
 *
 * La tabla solo guarda el vínculo entre usuario y carrera: no se copian
 * el nombre ni la institución, como se hacía antes. En una base
 * relacional eso sobra, y evita que el favorito muestre datos viejos si
 * la carrera cambia.
 *
 * La clave primaria compuesta (usuario_id, carrera_id) impide guardar dos
 * veces la misma carrera, sin tener que inventar un id combinado.
 */
@Injectable({ providedIn: 'root' })
export class FavoritosService {
  private supabase = inject(SupabaseClientService).cliente;
  private authService = inject(AuthService);

  /** Ids de las carreras marcadas como favoritas. */
  getFavoritosIds(): Observable<Set<string>> {
    return this.authService.user$.pipe(
      switchMap((user) => {
        if (!user) return of(new Set<string>());

        const consulta = this.supabase
          .from('favoritos')
          .select('carrera_id')
          .eq('usuario_id', user.id);

        return from(consulta).pipe(
          map(({ data, error }) => {
            if (error) throw error;
            return new Set((data ?? []).map((f: any) => String(f.carrera_id)));
          })
        );
      })
    );
  }

  /**
   * Las carreras favoritas, ya resueltas.
   *
   * Una sola consulta con join: antes había que traer todo el catálogo y
   * cruzarlo en el navegador.
   */
  getFavoritos(): Observable<CarreraDoc[]> {
    return this.authService.user$.pipe(
      switchMap((user) => {
        if (!user) return of([] as CarreraDoc[]);

        const consulta = this.supabase
          .from('favoritos')
          .select('carrera_id, creado_en, carreras(*)')
          .eq('usuario_id', user.id)
          .order('creado_en', { ascending: false });

        return from(consulta).pipe(
          map(({ data, error }) => {
            if (error) throw error;

            return (data ?? [])
              .map((f: any) => f.carreras)
              .filter(Boolean)
              .map((c: any) => ({ ...c, id: String(c.id) }) as CarreraDoc);
          })
        );
      })
    );
  }

  /** Agrega o quita, según cómo esté. */
  async toggleFavorito(carrera: CarreraDoc): Promise<void> {
    const uid = this.authService.getUid();
    if (!uid) throw new Error('SIN_SESION');
    if (!carrera?.id) throw new Error('CARRERA_SIN_ID');

    const carreraId = Number(carrera.id);

    const { data, error } = await this.supabase
      .from('favoritos')
      .select('carrera_id')
      .eq('usuario_id', uid)
      .eq('carrera_id', carreraId)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      const { error: errBorrar } = await this.supabase
        .from('favoritos')
        .delete()
        .eq('usuario_id', uid)
        .eq('carrera_id', carreraId);

      if (errBorrar) throw errBorrar;
      return;
    }

    const { error: errCrear } = await this.supabase
      .from('favoritos')
      .insert({ usuario_id: uid, carrera_id: carreraId });

    if (errCrear) throw errCrear;
  }

  async quitarFavorito(carrera: CarreraDoc): Promise<void> {
    const uid = this.authService.getUid();
    if (!uid) throw new Error('SIN_SESION');

    const { error } = await this.supabase
      .from('favoritos')
      .delete()
      .eq('usuario_id', uid)
      .eq('carrera_id', Number(carrera.id));

    if (error) throw error;
  }
}
