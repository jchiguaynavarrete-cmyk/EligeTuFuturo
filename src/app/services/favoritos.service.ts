import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  query,
  where,
  doc,
  setDoc,
  deleteDoc,
  getDoc,
} from '@angular/fire/firestore';
import { of, Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { CarreraDoc } from './carreras.service';

interface FavoritoDoc {
  uid: string;
  carrera_id: string;       // 🔑 ID REAL de la carrera (CarreraDoc.id)
  codigo_carrera?: string;
  carrera?: string;
  nombre_institucion?: string;
  sede?: string;
  horario?: string;
  creadoEn?: Date;
}

@Injectable({
  providedIn: 'root',
})
export class FavoritosService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

  /**
   * ✅ Devuelve un Set con los IDs de carrera favoritos
   * SIEMPRE basado en carrera_id (CarreraDoc.id)
   */
  getFavoritosIds(): Observable<Set<string>> {
    return this.authService.user$.pipe(
      switchMap((user) => {
        if (!user) return of(new Set<string>());

        const colRef = collection(this.firestore, 'favoritos');
        const q = query(colRef, where('uid', '==', user.uid));

        return collectionData(q).pipe(
          map((docs: any[]) => {
            const ids = docs
              .map((d: FavoritoDoc) => d.carrera_id)
              .filter(Boolean);

            return new Set<string>(ids);
          })
        );
      })
    );
  }

  /**
   * ✅ Agrega o elimina un favorito
   * docId = uid_carreraId
   */
  async toggleFavorito(carrera: CarreraDoc): Promise<void> {
    const uid = this.authService.getUid();
    if (!uid) {
      console.warn('No hay usuario autenticado, no se puede usar favoritos.');
      return;
    }

    if (!carrera?.id) {
      console.warn(
        'La carrera no trae idField (docId). Revisa collectionData(..., { idField: "id" }).'
      );
      return;
    }

    const favDocId = `${uid}_${carrera.id}`;
    const ref = doc(this.firestore, `favoritos/${favDocId}`);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      // ❌ Quitar favorito
      await deleteDoc(ref);
    } else {
      // ⭐ Crear favorito
      await setDoc(ref, {
        uid,
        carrera_id: carrera.id,                 // 🔑 CLAVE ÚNICA REAL
        codigo_carrera: carrera.codigo_carrera, // extra (opcional)
        carrera: carrera.carrera,
        nombre_institucion: carrera.nombre_institucion,
        sede: carrera.sede,
        horario: carrera.horario,
        creadoEn: new Date(),
      } as FavoritoDoc);
    }
  }
}
