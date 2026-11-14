import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  query,
  where,
  doc,
  updateDoc,
  getDocs,
  orderBy,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
  CollectionReference,
  Query,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

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

  // ====== IMPORTANTES (JSON REAL) ======
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

  // extras que aparecen en tus docs (opcionales)
  otros?: string;
  promedio_nem?: string;
  promedio_psu_1er_anyo?: string;
  cobertura_psu_1er_anyo?: string;
  matematicas2?: string;
}

export type CarreraDoc = Carrera & { id: string };

@Injectable({ providedIn: 'root' })
export class CarrerasService {
  private firestore = inject(Firestore);

  // ✅ USUARIO NORMAL: solo activas (realtime)
  getCarreras(): Observable<CarreraDoc[]> {
    const colRef = collection(this.firestore, 'carreras');
    const qRef = query(colRef, where('activa', '==', true));
    return collectionData(qRef, { idField: 'id' as any }) as Observable<CarreraDoc[]>;
  }

  // ✅ FAVORITOS: todas (activas e inactivas) (realtime)
  getCarrerasTodas(): Observable<CarreraDoc[]> {
    const colRef = collection(this.firestore, 'carreras');
    const qRef = query(colRef);
    return collectionData(qRef, { idField: 'id' as any }) as Observable<CarreraDoc[]>;
  }

  // ✅ ADMIN: activar/desactivar
  async setCarreraActiva(carreraId: string, activa: boolean): Promise<void> {
    const ref = doc(this.firestore, `carreras/${carreraId}`);
    await updateDoc(ref, { activa });
  }

  // ================
  //   ADMIN PAGINADO
  // ================
  async getCarrerasAdminPage(opts: {
    vista: 'activas' | 'inactivas' | 'todas';
    pageSize: number;
    cursor?: QueryDocumentSnapshot<DocumentData> | null;
  }): Promise<{
    items: CarreraDoc[];
    cursor: QueryDocumentSnapshot<DocumentData> | null;
  }> {
    const colRef = collection(this.firestore, 'carreras') as CollectionReference<Carrera>;

    let base: Query<Carrera> = query(colRef);

    if (opts.vista === 'activas') {
      base = query(colRef, where('activa', '==', true));
    } else if (opts.vista === 'inactivas') {
      base = query(colRef, where('activa', '==', false));
    } else {
      base = query(colRef);
    }

    let qFinal: Query<Carrera> = query(
      base,
      orderBy('carrera'),
      orderBy('__name__'),
      limit(opts.pageSize)
    );

    if (opts.cursor) {
      qFinal = query(
        base,
        orderBy('carrera'),
        orderBy('__name__'),
        startAfter(opts.cursor),
        limit(opts.pageSize)
      );
    }

    const snap = await getDocs(qFinal);

    const items: CarreraDoc[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Carrera),
    }));

    const cursor = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;

    return { items, cursor };
  }
}
