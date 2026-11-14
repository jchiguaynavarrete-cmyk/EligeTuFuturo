import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';

import { SupabaseClientService } from '../core/supabase.client';

export interface Carrera {
  // ====== BÁSICOS (UI) ======
  codigo_carrera: string;
  carrera: string;
  nombre_institucion: string;
  region_sede: string;
  sede: string;
  area_cineunesco: string;
  horario: string;

  es_tecnico: string;
  duracion_formal: string;
  vacantes_primer_semestre: string;
  valor_arancel: string;

  // ====== PONDERACIONES ======
  notas_em: string;
  psu_lenguaje: string;
  psu_matematicas: string;
  psu_historia: string;
  psu_ciencias: string;
  ranking: string;

  // ====== CONTROL ======
  activa: boolean;

  // ====== COMPLEMENTARIOS ======
  costo_titulacion?: string;
  total_femenino_matriculados?: string;
  total_masculino_matriculados?: string;
  total_matriculados?: string;
  matriculados_femeninos_primer_anyo?: string;
  matriculados_masculinos_primer_anyo?: string;
  total_matriculados_primer_anyo?: string;
  municipal?: string;
  particular_subvencionado?: string;
  particular_pagado?: string;
  total_femenino?: string;
  total_masculino?: string;
  total_titulados?: string;
  otros?: string;
  promedio_nem?: string;
  promedio_psu_1er_anyo?: string;
  cobertura_psu_1er_anyo?: string;
  matematicas2?: string;
}

/** El id se expone como texto para no cambiar las páginas que ya lo usan así. */
export type CarreraDoc = Carrera & { id: string };

/** Un tramo de resultados, para la vista paginada del administrador. */
export interface PaginaCarreras {
  items: CarreraDoc[];
  total: number;
}

/** PostgREST no devuelve más de 1.000 filas por consulta. */
const TAMANO_TRAMO = 1000;

@Injectable({ providedIn: 'root' })
export class CarrerasService {
  private supabase = inject(SupabaseClientService).cliente;

  /**
   * Todas las carreras activas.
   *
   * Supabase corta en 1.000 filas por consulta, así que se piden por
   * tramos hasta completar. A diferencia de la base, aquí no se paga
   * por fila leída: el costo es una consulta, no miles de lecturas.
   */
  getCarreras(): Observable<CarreraDoc[]> {
    return from(this.traerTodas(true));
  }

  /** Activas e inactivas. Lo usa Favoritos para resolver carreras guardadas. */
  getCarrerasTodas(): Observable<CarreraDoc[]> {
    return from(this.traerTodas(null));
  }

  private async traerTodas(soloActivas: boolean | null): Promise<CarreraDoc[]> {
    const acumulado: CarreraDoc[] = [];
    let desde = 0;

    // Se corta cuando un tramo viene incompleto: ahí se acabaron los datos.
    for (;;) {
      let consulta = this.supabase
        .from('carreras')
        .select('*')
        .order('carrera', { ascending: true })
        .range(desde, desde + TAMANO_TRAMO - 1);

      if (soloActivas !== null) consulta = consulta.eq('activa', soloActivas);

      const { data, error } = await consulta;
      if (error) throw error;

      acumulado.push(...(data ?? []).map((c) => this.aDoc(c)));

      if (!data || data.length < TAMANO_TRAMO) break;
      desde += TAMANO_TRAMO;
    }

    return acumulado;
  }

  /**
   * Página de carreras con filtros resueltos en la base.
   *
   * Pensado para no traer el catálogo entero cuando solo se van a mostrar
   * veinte filas. Es el camino correcto y el que conviene usar en la
   * pantalla del alumno cuando se la adapte.
   */
  async getCarrerasPagina(opts: {
    vista?: 'activas' | 'inactivas' | 'todas';
    busqueda?: string;
    area?: string;
    region?: string;
    institucion?: string;
    pagina?: number;
    tamano?: number;
  }): Promise<PaginaCarreras> {
    const tamano = opts.tamano ?? 20;
    const pagina = opts.pagina ?? 0;
    const desde = pagina * tamano;

    let consulta = this.supabase
      .from('carreras')
      .select('*', { count: 'exact' })
      .order('carrera', { ascending: true })
      .range(desde, desde + tamano - 1);

    if (opts.vista === 'activas') consulta = consulta.eq('activa', true);
    if (opts.vista === 'inactivas') consulta = consulta.eq('activa', false);

    if (opts.area && opts.area !== 'TODAS') {
      consulta = consulta.eq('area_cineunesco', opts.area);
    }
    if (opts.region && opts.region !== 'TODAS') {
      consulta = consulta.eq('region_sede', opts.region);
    }
    if (opts.institucion && opts.institucion !== 'TODAS') {
      consulta = consulta.eq('nombre_institucion', opts.institucion);
    }

    const termino = (opts.busqueda ?? '').trim();
    if (termino) {
      // El índice de trigramas hace eficiente esta búsqueda por fragmento.
      const patron = `%${termino}%`;
      consulta = consulta.or(
        `carrera.ilike.${patron},nombre_institucion.ilike.${patron},region_sede.ilike.${patron}`
      );
    }

    const { data, error, count } = await consulta;
    if (error) throw error;

    return {
      items: (data ?? []).map((c) => this.aDoc(c)),
      total: count ?? 0,
    };
  }

  /** Valores únicos para poblar los selectores de filtro. */
  async getOpcionesFiltro(columna: 'area_cineunesco' | 'region_sede' | 'nombre_institucion'): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('carreras')
      .select(columna)
      .eq('activa', true);

    if (error) throw error;

    const valores = new Set<string>();
    (data ?? []).forEach((f: any) => {
      const v = (f[columna] ?? '').trim();
      if (v) valores.add(v);
    });

    return [...valores].sort((a, b) => a.localeCompare(b, 'es'));
  }

  /** Solo el administrador; lo exige la política de la tabla. */
  async setCarreraActiva(carreraId: string, activa: boolean): Promise<void> {
    const { error } = await this.supabase
      .from('carreras')
      .update({ activa })
      .eq('id', Number(carreraId));

    if (error) throw error;
  }

  /**
   * Compatibilidad con la pantalla de administración, que fue escrita
   * para el paginado por cursor de la base.
   */
  async getCarrerasAdminPage(opts: {
    vista: 'activas' | 'inactivas' | 'todas';
    pageSize: number;
    cursor?: number | null;
  }): Promise<{ items: CarreraDoc[]; cursor: number | null }> {
    const pagina = opts.cursor ?? 0;

    const { items } = await this.getCarrerasPagina({
      vista: opts.vista,
      pagina,
      tamano: opts.pageSize,
    });

    return {
      items,
      // Si el tramo vino completo puede haber más; si no, se acabó.
      cursor: items.length === opts.pageSize ? pagina + 1 : null,
    };
  }

  private aDoc(fila: any): CarreraDoc {
    return { ...fila, id: String(fila.id) } as CarreraDoc;
  }
}
