import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  setDoc,
  docData,
  getDoc,
  serverTimestamp,
  collection,
  collectionData,
  query,
  orderBy,
} from '@angular/fire/firestore';
import { Observable, map, of, switchMap } from 'rxjs';

export interface UsuarioPerfil {
  uid: string;
  email: string;
  nombre: string;           // nombre completo armado, para mostrar e iniciales
  nombres?: string;         // uno o dos nombres
  apellidoPaterno?: string; // primer apellido
  apellidoMaterno?: string; // segundo apellido (puede venir vacío)
  rut: string;              // guardado formateado (ej: 11.111.111-1)
  rut_limpio?: string;      // extra: 111111111 (opcional)
  fechaNacimiento: any;
  edad: number;
  rol: 'user' | 'admin' | 'institucion';

  /**
   * Establecimiento al que pertenece el estudiante. Mientras no exista,
   * se considera que su colegio no tiene convenio.
   */
  institucionId?: string;
  creadoEn: any;
}

@Injectable({ providedIn: 'root' })
export class UsuarioService {
  private firestore = inject(Firestore);

  private limpiarRut(rut: string): string {
    return (rut || '').replace(/\./g, '').replace(/-/g, '').trim().toUpperCase();
  }

  private calcularEdad(fechaNac: Date): number {
    const hoy = new Date();
    let edad = hoy.getFullYear() - fechaNac.getFullYear();
    const m = hoy.getMonth() - fechaNac.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < fechaNac.getDate())) edad--;
    return edad;
  }

  async perfilExiste(uid: string): Promise<boolean> {
    const ref = doc(this.firestore, `usuarios/${uid}`);
    const snap = await getDoc(ref);
    return snap.exists();
  }

  /**
   * Crea el perfil SOLO si no existe (ideal para después de verificar email).
   * Además asegura RUT único con rut_index/{rut_limpio}.
   */
  async crearPerfilSiNoExiste(
    uid: string,
    data: {
      email: string;
      nombre: string;
      nombres?: string;
      apellidoPaterno?: string;
      apellidoMaterno?: string;
      rut: string;
      fechaNacimiento: Date;
    }
  ) {
    const userRef = doc(this.firestore, `usuarios/${uid}`);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) return; // ya creado

    const rutLimpio = this.limpiarRut(data.rut);

    // índice anti-duplicados
    const rutRef = doc(this.firestore, `rut_index/${rutLimpio}`);
    const rutSnap = await getDoc(rutRef);

    if (rutSnap.exists()) {
      const dueño = (rutSnap.data() as any)?.uid;
      if (dueño && dueño !== uid) {
        throw new Error('RUT_DUPLICADO');
      }
    }

    const edad = this.calcularEdad(data.fechaNacimiento);

    const perfil: UsuarioPerfil = {
      uid,
      email: data.email,
      nombre: data.nombre,
      nombres: data.nombres ?? '',
      apellidoPaterno: data.apellidoPaterno ?? '',
      apellidoMaterno: data.apellidoMaterno ?? '',
      rut: data.rut,
      rut_limpio: rutLimpio,
      fechaNacimiento: data.fechaNacimiento,
      edad,
      rol: 'user',
      creadoEn: serverTimestamp(),
    };

    // 1) Reservar rut_index (si no existía)
    // 2) Crear usuarios/{uid}
    // Nota: sin transaction para ir rápido, pero reglas impedirán colisiones por create si ya existe.
    await setDoc(rutRef, { uid, creadoEn: serverTimestamp() }, { merge: false });
    await setDoc(userRef, perfil, { merge: false });
  }

  /**
   * Todos los perfiles, del más reciente al más antiguo.
   * Solo para el panel de administración: las reglas de Firestore deben
   * permitir leer la colección completa a quien tenga rol admin.
   */
  listarUsuarios(): Observable<UsuarioPerfil[]> {
    const colRef = collection(this.firestore, 'usuarios');
    const qRef = query(colRef, orderBy('creadoEn', 'desc'));

    return collectionData(qRef, { idField: 'uid' }) as Observable<UsuarioPerfil[]>;
  }

  /**
   * Indica si el estudiante puede usar las funciones que requieren convenio.
   *
   * Un administrador siempre pasa: si no, no podría revisar ni demostrar la
   * app. Un estudiante pasa solo si su establecimiento tiene el plan activo.
   */
  tieneAccesoConConvenio(uid: string): Observable<boolean> {
    return this.getUsuario(uid).pipe(
      switchMap((perfil) => {
        if (!perfil) return of(false);
        if (perfil.rol === 'admin') return of(true);
        if (!perfil.institucionId) return of(false);

        const ref = doc(this.firestore, `instituciones/${perfil.institucionId}`);
        return docData(ref).pipe(
          map((inst: any) => inst?.estadoPlan === 'activo')
        );
      })
    );
  }

  getUsuario(uid: string): Observable<UsuarioPerfil | null> {
    const ref = doc(this.firestore, `usuarios/${uid}`);
    return docData(ref).pipe(map((data) => (data ? (data as UsuarioPerfil) : null)));
  }
}
