import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonSearchbar,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

import { Observable, of, BehaviorSubject } from 'rxjs';
import { catchError, map, startWith, switchMap } from 'rxjs/operators';

import { UsuarioService, UsuarioPerfil } from 'src/app/services/usuario.service';

type EstadoLista = {
  cargando: boolean;
  error: string;
  usuarios: UsuarioPerfil[];
};

@Component({
  selector: 'app-admin-usuarios',
  standalone: true,
  templateUrl: './admin-usuarios.page.html',
  styleUrls: ['./admin-usuarios.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonSearchbar,
    IonSpinner,
  ],
})
export class AdminUsuariosPage {
  private usuarioService = inject(UsuarioService);

  estado$: Observable<EstadoLista>;
  busqueda = '';

  /** La consulta se resuelve una vez; esto la repite al volver a entrar. */
  private recargar$ = new BehaviorSubject<void>(undefined);

  ionViewWillEnter(): void {
    this.recargar$.next();
  }

  constructor() {
    this.estado$ = this.recargar$.pipe(
      switchMap(() => this.usuarioService.listarUsuarios().pipe(
      map((usuarios) => ({ cargando: false, error: '', usuarios })),
      catchError((err) => {
        console.error(err);

        // El caso más probable no es un bug, sino que las reglas de
        // la base no dejen leer la tabla completa.
        const sinPermiso = err?.code === 'permission-denied';

        return of({
          cargando: false,
          usuarios: [],
          error: sinPermiso
            ? 'La base rechazó la lectura. Revisa que las reglas permitan a un admin leer la colección "usuarios".'
            : 'No se pudo cargar la lista de usuarios.',
        });
      }),
          startWith({ cargando: true, error: '', usuarios: [] as UsuarioPerfil[] })
        )
      )
    );
  }

  filtrar(usuarios: UsuarioPerfil[]): UsuarioPerfil[] {
    const termino = this.busqueda.trim().toLowerCase();
    if (!termino) return usuarios;

    return usuarios.filter((u) =>
      [u.nombre, u.email, u.rut, u.rut_limpio]
        .some((campo) => (campo || '').toLowerCase().includes(termino))
    );
  }

  getIniciales(nombre?: string | null): string {
    const n = (nombre || '').trim();
    if (!n) return 'U';

    const partes = n.split(' ').filter(Boolean);
    const a = partes[0]?.[0] ?? 'U';
    const b = partes.length > 1 ? partes[partes.length - 1]?.[0] ?? '' : '';

    return (a + b).toUpperCase();
  }

  /** `creadoEn` viene como Timestamp de la base, no como Date. */
  fechaRegistro(valor: any): string {
    const fecha = valor?.toDate?.() ?? (valor ? new Date(valor) : null);
    if (!fecha || isNaN(fecha.getTime())) return '—';

    return fecha.toLocaleDateString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  trackPorUid(_: number, usuario: UsuarioPerfil): string {
    return usuario.uid;
  }
}
