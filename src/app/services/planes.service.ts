import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  setDoc,
  updateDoc,
  getDocs,
  query,
  orderBy,
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';

import { Plan, PlanId } from '../models/planes.model';

/** Planes que ya no se ofrecen. Se desactivan al sincronizar, sin borrarlos. */
const PLANES_RETIRADOS: PlanId[] = ['redEducativa'];

/**
 * Catálogo de planes institucionales.
 *
 * Los precios y textos viven en Firestore (`planes/{id}`) para poder
 * cambiarlos sin recompilar la app. `sincronizarPlanes()` crea o actualiza
 * la colección con la estructura definida en la evaluación del proyecto.
 */
@Injectable({ providedIn: 'root' })
export class PlanesService {
  private firestore = inject(Firestore);

  /**
   * Planes activos, ordenados para la vitrina.
   *
   * El filtro y el orden se hacen en el cliente a propósito: combinar
   * `where('activo')` con `orderBy('orden')` obliga a Firestore a tener un
   * índice compuesto, y son apenas un puñado de documentos. Así la vitrina
   * no depende de un índice que haya que crear y esperar que se construya.
   */
  listarPlanesActivos(): Observable<Plan[]> {
    const colRef = collection(this.firestore, 'planes');

    return (collectionData(colRef, { idField: 'id' }) as Observable<Plan[]>).pipe(
      map((planes) =>
        planes
          .filter((p) => p.activo)
          .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
      )
    );
  }

  /** Todos los planes, incluidos los desactivados (para administración). */
  listarTodos(): Observable<Plan[]> {
    const colRef = collection(this.firestore, 'planes');
    return collectionData(query(colRef, orderBy('orden')), {
      idField: 'id',
    }) as Observable<Plan[]>;
  }

  getPlan(id: PlanId): Observable<Plan | null> {
    const ref = doc(this.firestore, `planes/${id}`);
    return docData(ref, { idField: 'id' }).pipe(
      map((d) => (d ? (d as Plan) : null))
    );
  }

  /** Solo el administrador puede cambiar precios; lo exigen las reglas. */
  async actualizarPlan(id: PlanId, cambios: Partial<Plan>): Promise<void> {
    const ref = doc(this.firestore, `planes/${id}`);
    await updateDoc(ref, cambios);
  }

  /**
   * Crea o reemplaza los cinco planes vigentes y desactiva los retirados.
   * Las solicitudes ya enviadas no se tocan: guardan su propio planNombre y monto.
   */
  async sincronizarPlanes(): Promise<{ actualizados: number; desactivados: number }> {
    const vigentes = this.planesPorDefecto();

    for (const plan of vigentes) {
      const { id, ...datos } = plan;
      await setDoc(doc(this.firestore, `planes/${id}`), datos);
    }

    const existentes = await getDocs(collection(this.firestore, 'planes'));
    let desactivados = 0;

    for (const d of existentes.docs) {
      if (PLANES_RETIRADOS.includes(d.id as PlanId) && d.data()['activo'] !== false) {
        await updateDoc(d.ref, { activo: false });
        desactivados++;
      }
    }

    return { actualizados: vigentes.length, desactivados };
  }

  /**
   * Estructura de planes de la evaluación del proyecto.
   * Precios: valores netos anuales (sin IVA) del primer año de contrato.
   */
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
