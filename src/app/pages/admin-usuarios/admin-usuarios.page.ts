import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonSearchbar,
  IonToolbar,
} from '@ionic/angular/standalone';

import { Observable, of, BehaviorSubject } from 'rxjs';
import { catchError, map, startWith, switchMap } from 'rxjs/operators';

import { AlertController, ToastController } from '@ionic/angular';

import { UsuarioService, UsuarioPerfil } from 'src/app/services/usuario.service';
import { AuthService } from 'src/app/services/auth.service';

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
      IonToolbar,
    IonButtons,
    IonBackButton,
    IonSearchbar,
    ],
})
export class AdminUsuariosPage {
  private usuarioService = inject(UsuarioService);

  estado$: Observable<EstadoLista>;
  busqueda = '';

  /** La consulta se resuelve una vez; esto la repite al volver a entrar. */
  private authService = inject(AuthService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  /** Para no ofrecer el borrado de la propia cuenta. */
  readonly miUid = this.authService.getUid();

  /** Uid de la cuenta que se está eliminando, para bloquear su botón. */
  eliminando: string | null = null;

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

  /**
   * Elimina una cuenta, tras confirmar.
   *
   * Se nombra a la persona y se dice qué se pierde: es una operación
   * definitiva, y en una lista todas las filas se parecen entre sí.
   */
  async eliminarUsuario(u: UsuarioPerfil): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Eliminar cuenta',
      subHeader: u.nombre || u.email,
      message: [
        'Se borran su perfil y sus carreras favoritas.',
        '',
        'Si es una institución, también su plan vigente.',
        '',
        'Sus solicitudes y pagos quedan registrados, sin titular.',
        '',
        'Esto no se puede deshacer.',
      ].join(String.fromCharCode(10)),
      cssClass: 'alerta-texto',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'eliminar', cssClass: 'boton-peligro' },
      ],
    });

    await alert.present();

    // El trabajo va después del cierre del diálogo.
    const { role } = await alert.onDidDismiss();
    if (role !== 'eliminar') return;

    this.eliminando = u.uid;

    try {
      await this.usuarioService.eliminarUsuario(u.uid);
      this.recargar$.next();
      await this.avisar(`Se eliminó la cuenta de ${u.nombre || u.email}.`);
    } catch (err: any) {
      console.error('No se pudo eliminar:', err);
      await this.avisar(err?.message || 'No se pudo eliminar la cuenta.');
    } finally {
      this.eliminando = null;
    }
  }

  private async avisar(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 5000,
      buttons: [{ text: 'Cerrar', role: 'cancel' }],
    });
    await toast.present();
  }
}
