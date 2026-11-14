import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';

import { SupabaseClientService } from '../core/supabase.client';
import { Plan, PlanId } from '../models/planes.model';

/** Planes que ya no se ofrecen. Se desactivan al sincronizar, sin borrarlos. */
const PLANES_RETIRADOS: string[] = ['redEducativa'];

/**
 * Catálogo de planes institucionales.
 *
 * Los precios y textos viven en la base para poder cambiarlos sin
 * recompilar la app.
 */
@Injectable({ providedIn: 'root' })
export class PlanesService {
  private supabase = inject(SupabaseClientService).cliente;

  /** Traduce una fila de `planes` a la forma que usan las páginas. */
  private aPlan(f: any): Plan {
    return {
      id: f.id,
      nombre: f.nombre,
      descripcion: f.descripcion ?? '',
      caracteristicas: f.caracteristicas ?? [],
      textoBoton: f.texto_boton,
      precio: f.precio,
      requierePago: f.requiere_pago,
      requiereCotizacion: f.requiere_cotizacion,
      duracionMeses: f.duracion_meses,
      establecimientos: f.establecimientos,
      cobertura: f.cobertura ?? undefined,
      idealPara: f.ideal_para ?? undefined,
      categoria: f.categoria ?? undefined,
      destacado: f.destacado,
      activo: f.activo,
      orden: f.orden,
    } as Plan;
  }

  /** Planes activos, ordenados para la vitrina. Lectura pública. */
  listarPlanesActivos(): Observable<Plan[]> {
    const consulta = this.supabase
      .from('planes')
      .select('*')
      .eq('activo', true)
      .order('orden', { ascending: true });

    return from(consulta).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map((f) => this.aPlan(f));
      })
    );
  }

  /** Todos, incluidos los desactivados. Para administración. */
  listarTodos(): Observable<Plan[]> {
    const consulta = this.supabase
      .from('planes')
      .select('*')
      .order('orden', { ascending: true });

    return from(consulta).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map((f) => this.aPlan(f));
      })
    );
  }

  getPlan(id: PlanId | string): Observable<Plan | null> {
    const consulta = this.supabase
      .from('planes')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    return from(consulta).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data ? this.aPlan(data) : null;
      })
    );
  }

  /** Solo el administrador puede cambiar precios; lo exige la política. */
  async actualizarPlan(id: PlanId | string, cambios: Partial<Plan>): Promise<void> {
    const fila: any = {};

    if (cambios.nombre !== undefined) fila.nombre = cambios.nombre;
    if (cambios.descripcion !== undefined) fila.descripcion = cambios.descripcion;
    if (cambios.caracteristicas !== undefined) fila.caracteristicas = cambios.caracteristicas;
    if (cambios.textoBoton !== undefined) fila.texto_boton = cambios.textoBoton;
    if (cambios.precio !== undefined) fila.precio = cambios.precio;
    if (cambios.requierePago !== undefined) fila.requiere_pago = cambios.requierePago;
    if (cambios.requiereCotizacion !== undefined) fila.requiere_cotizacion = cambios.requiereCotizacion;
    if (cambios.duracionMeses !== undefined) fila.duracion_meses = cambios.duracionMeses;
    if (cambios.destacado !== undefined) fila.destacado = cambios.destacado;
    if (cambios.activo !== undefined) fila.activo = cambios.activo;
    if (cambios.orden !== undefined) fila.orden = cambios.orden;

    const { error } = await this.supabase.from('planes').update(fila).eq('id', id);
    if (error) throw error;
  }

  /**
   * Crea o reemplaza los cinco planes vigentes y desactiva los retirados.
   * Las solicitudes ya enviadas no se tocan: guardan su propio nombre de
   * plan y su monto.
   */
  async sincronizarPlanes(): Promise<{ actualizados: number; desactivados: number }> {
    const vigentes = this.planesPorDefecto();

    const filas = vigentes.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      caracteristicas: p.caracteristicas,
      texto_boton: p.textoBoton,
      precio: p.precio,
      requiere_pago: p.requierePago,
      requiere_cotizacion: p.requiereCotizacion,
      duracion_meses: p.duracionMeses,
      establecimientos: p.establecimientos ?? null,
      cobertura: p.cobertura ?? null,
      ideal_para: p.idealPara ?? null,
      categoria: p.categoria ?? null,
      destacado: p.destacado,
      activo: p.activo,
      orden: p.orden,
    }));

    const { error } = await this.supabase.from('planes').upsert(filas, { onConflict: 'id' });
    if (error) throw error;

    const { data: retirados, error: errRetirar } = await this.supabase
      .from('planes')
      .update({ activo: false })
      .in('id', PLANES_RETIRADOS)
      .eq('activo', true)
      .select('id');

    if (errRetirar) throw errRetirar;

    return { actualizados: vigentes.length, desactivados: (retirados ?? []).length };
  }

  private planesPorDefecto(): Plan[] {
    return [
      {
        id: 'escolar',
        nombre: 'Plan Escolar',
        descripcion: 'Para un colegio o liceo.',
        caracteristicas: [
          'Todos los estudiantes de 4° medio del establecimiento',
          'Buscador, comparador, simulador PAES, mapa y favoritos',
          '1 cuenta de orientador',
          'Capacitación inicial en línea',
          'Soporte por correo',
        ],
        textoBoton: 'Seleccionar plan',
        precio: 1200000,
        requierePago: true,
        requiereCotizacion: false,
        duracionMeses: 12,
        destacado: false,
        activo: true,
        orden: 1,
        establecimientos: 1,
        cobertura: '1 establecimiento',
        idealPara: 'Colegios y liceos',
        categoria: 'pagado',
      },
      {
        id: 'comunal',
        nombre: 'Plan Comunal',
        descripcion: 'Para la red de establecimientos de una comuna.',
        caracteristicas: [
          'Todo lo del Plan Escolar, en hasta 5 establecimientos',
          '1 cuenta de orientador por establecimiento',
          'Panel comunal con reporte de uso por establecimiento',
          'Capacitación para cada establecimiento',
          'Soporte prioritario',
        ],
        textoBoton: 'Seleccionar plan',
        precio: 5500000,
        requierePago: true,
        requiereCotizacion: false,
        duracionMeses: 12,
        destacado: true,
        activo: true,
        orden: 2,
        establecimientos: 5,
        cobertura: 'Hasta 5 establecimientos',
        idealPara: 'Municipalidades y corporaciones',
        categoria: 'pagado',
      },
      {
        id: 'territorial',
        nombre: 'Plan Territorial',
        descripcion: 'Para SLEP y redes educativas amplias.',
        caracteristicas: [
          'Todo lo del Plan Comunal, en hasta 10 establecimientos',
          'Panel territorial con reporte consolidado de la red',
          'Reunión de seguimiento semestral con el equipo',
          'Soporte prioritario',
        ],
        textoBoton: 'Seleccionar plan',
        precio: 10000000,
        requierePago: true,
        requiereCotizacion: false,
        duracionMeses: 12,
        destacado: false,
        activo: true,
        orden: 3,
        establecimientos: 10,
        cobertura: 'Hasta 10 establecimientos',
        idealPara: 'SLEP y redes educativas',
        categoria: 'pagado',
      },
      {
        id: 'piloto',
        nombre: 'Plan Piloto',
        descripcion:
          'Prueba EligeTuFuturo en 1 establecimiento durante 60 días antes de contratar. Cupos limitados por semestre.',
        caracteristicas: [
          'Todas las funciones para 1 establecimiento',
          'Duración de 60 días',
          'Luego puedes contratar cualquier plan anual',
        ],
        textoBoton: 'Solicitar piloto',
        precio: null,
        requierePago: false,
        requiereCotizacion: false,
        duracionMeses: 2,
        destacado: false,
        activo: true,
        orden: 4,
        establecimientos: 1,
        cobertura: '1 establecimiento por 60 días',
        idealPara: 'Instituciones que quieren evaluar la solución',
        categoria: 'complementario',
      },
      {
        id: 'nacional',
        nombre: 'Convenio Nacional',
        descripcion:
          'Para el Ministerio de Educación u organismos con cobertura regional o nacional. Implementación gradual por regiones.',
        caracteristicas: [
          'Cobertura definida por convenio',
          'Implementación gradual por regiones',
          'Propuesta y valor a medida',
        ],
        textoBoton: 'Solicitar cotización',
        precio: null,
        requierePago: true,
        requiereCotizacion: true,
        duracionMeses: 12,
        destacado: false,
        activo: true,
        orden: 5,
        establecimientos: null,
        cobertura: 'Definida por convenio',
        idealPara: 'Ministerio de Educación',
        categoria: 'complementario',
      },
    ];
  }
}
