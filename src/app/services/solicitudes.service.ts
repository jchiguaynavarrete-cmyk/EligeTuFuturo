import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  addDoc,
  setDoc,
  updateDoc,
  getDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';

import { Auth } from '@angular/fire/auth';
import { environment } from 'src/environments/environment';

import {
  Solicitud,
  EstadoSolicitud,
  Plan,
  Institucion,
} from '../models/planes.model';

/** Lo que llena la institución en el formulario. Nada más que esto. */
export interface DatosSolicitud {
  nombreInstitucion: string;
  rbd: string;
  encargado: string;
  correo: string;
  telefono: string;
  cantidadEstudiantes: number;
}

@Injectable({ providedIn: 'root' })
export class SolicitudesService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);

  /**
   * Crea la solicitud en estado pendiente.
   *
   * El monto y el estado los fija después el administrador: aquí se escriben
   * con valores neutros a propósito, para que el formulario no pueda
   * proponer un precio ni darse por aprobado.
   */
  async crearSolicitud(
    uid: string,
    plan: Plan,
    datos: DatosSolicitud
  ): Promise<string> {
    const colRef = collection(this.firestore, 'solicitudes');

    const ref = await addDoc(colRef, {
      nombreInstitucion: datos.nombreInstitucion.trim(),
      rbd: datos.rbd.trim(),
      encargado: datos.encargado.trim(),
      correo: datos.correo.trim().toLowerCase(),
      telefono: datos.telefono.trim(),
      cantidadEstudiantes: datos.cantidadEstudiantes,

      planId: plan.id,
      planNombre: plan.nombre,

      uidSolicitante: uid,
      origen: 'app' as const,

      estado: 'pendiente' as EstadoSolicitud,
      fechaSolicitud: serverTimestamp(),
      fechaResolucion: null,
      adminUid: null,
      motivoRechazo: null,

      monto: null,
      estadoPago: plan.requierePago ? 'pendiente' : 'no_aplica',
      pagoId: null,
    });

    return ref.id;
  }

  /** Solicitudes de una institución, de la más reciente a la más antigua. */
  listarMisSolicitudes(uid: string): Observable<Solicitud[]> {
    const colRef = collection(this.firestore, 'solicitudes');
    const qRef = query(
      colRef,
      where('uidSolicitante', '==', uid),
      orderBy('fechaSolicitud', 'desc')
    );

    return collectionData(qRef, { idField: 'id' }) as Observable<Solicitud[]>;
  }

  /** Todas las solicitudes. Solo administración. */
  listarTodas(): Observable<Solicitud[]> {
    const colRef = collection(this.firestore, 'solicitudes');
    const qRef = query(colRef, orderBy('fechaSolicitud', 'desc'));

    return collectionData(qRef, { idField: 'id' }) as Observable<Solicitud[]>;
  }

  getSolicitud(id: string): Observable<Solicitud | null> {
    const ref = doc(this.firestore, `solicitudes/${id}`);
    return docData(ref, { idField: 'id' }).pipe(
      map((d) => (d ? (d as Solicitud) : null))
    );
  }

  /**
   * Aprueba la solicitud y fija el monto a pagar.
   *
   * Si el plan no requiere pago (Piloto), se activa de inmediato y el
   * estado de pago queda en "no_aplica": esa decisión viene de la
   * configuración del plan, no de cada pantalla.
   */
  async aprobarSolicitud(
    solicitudId: string,
    adminUid: string,
    monto: number,
    plan: Plan
  ): Promise<void> {
    const ref = doc(this.firestore, `solicitudes/${solicitudId}`);

    await updateDoc(ref, {
      estado: 'aprobada' as EstadoSolicitud,
      monto: plan.requierePago ? monto : 0,
      estadoPago: plan.requierePago ? 'pendiente' : 'no_aplica',
      fechaResolucion: serverTimestamp(),
      adminUid,
      motivoRechazo: null,
    });

    if (!plan.requierePago) {
      await this.activarPlan(solicitudId, plan);
    }
  }

  async rechazarSolicitud(
    solicitudId: string,
    adminUid: string,
    motivo: string
  ): Promise<void> {
    const ref = doc(this.firestore, `solicitudes/${solicitudId}`);

    await updateDoc(ref, {
      estado: 'rechazada' as EstadoSolicitud,
      fechaResolucion: serverTimestamp(),
      adminUid,
      motivoRechazo: motivo.trim() || null,
    });
  }

  /**
   * Deja el plan vigente en `instituciones/{uid}`.
   *
   * Se usa para el Plan Piloto (gratuito) desde el panel de administración.
   * Para los planes pagados lo hace el backend al confirmar la transacción,
   * para que la activación no dependa del navegador.
   */
  async activarPlan(solicitudId: string, plan: Plan): Promise<void> {
    const snap = await getDoc(doc(this.firestore, `solicitudes/${solicitudId}`));
    if (!snap.exists()) throw new Error('SOLICITUD_NO_ENCONTRADA');

    const s = snap.data() as Solicitud;

    const inicio = new Date();
    const termino = new Date(inicio);
    termino.setMonth(termino.getMonth() + plan.duracionMeses);

    const institucion: Omit<Institucion, 'uid'> = {
      nombreInstitucion: s.nombreInstitucion,
      rbd: s.rbd,
      correo: s.correo,
      planId: plan.id,
      planNombre: plan.nombre,
      estadoPlan: 'activo',
      solicitudId,
      fechaInicio: inicio as any,
      fechaTermino: termino as any,
    };

    // merge: sirve tanto si la institución ya existía como si es la primera vez.
    const ref = doc(this.firestore, `instituciones/${s.uidSolicitante}`);
    await setDoc(ref, { uid: s.uidSolicitante, ...institucion }, { merge: true });
  }

  /**
   * Pide al backend que enlace a esta cuenta las solicitudes que llegaron
   * por el formulario público con el mismo correo.
   *
   * Se hace en el backend porque el correo se toma del token verificado:
   * si viniera del navegador, cualquiera podría reclamar las solicitudes
   * de otra institución.
   */
  async reclamarSolicitudesPublicas(): Promise<number> {
    const user = this.auth.currentUser;
    if (!user) return 0;

    try {
      const token = await user.getIdToken();
      const r = await fetch(`${environment.apiPagosUrl}/solicitudes/reclamar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!r.ok) return 0;
      const datos = await r.json();
      return datos?.enlazadas ?? 0;
    } catch {
      // Sin backend disponible el panel igual funciona: solo no enlaza.
      return 0;
    }
  }

  getInstitucion(uid: string): Observable<Institucion | null> {
    const ref = doc(this.firestore, `instituciones/${uid}`);
    return docData(ref, { idField: 'uid' }).pipe(
      map((d) => (d ? (d as Institucion) : null))
    );
  }
}
