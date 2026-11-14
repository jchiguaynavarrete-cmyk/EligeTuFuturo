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
   * Crea una cuenta desde el panel.
   *
   * Es la única forma de dejar a alguien como institución o
   * administrador sin entrar a la base de datos a mano.
   */
  async crearUsuario(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Crear cuenta',
      message:
        'La cuenta queda lista para usarse: tú le entregas el acceso a la ' +
        'persona.',
      cssClass: 'alerta-texto',
      inputs: [
        { name: 'nombres', type: 'text', placeholder: 'Nombres' },
        { name: 'apellidoPaterno', type: 'text', placeholder: 'Apellido paterno' },
        { name: 'apellidoMaterno', type: 'text', placeholder: 'Apellido materno (opcional)' },
        { name: 'rut', type: 'text', placeholder: 'RUT · 12.345.678-9' },
        { name: 'email', type: 'email', placeholder: 'Correo' },
        { name: 'password', type: 'password', placeholder: 'Contraseña, mínimo 8 caracteres' },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Estudiante', role: 'user' },
        { text: 'Institución', role: 'institucion' },
      ],
    });

    await alert.present();

    // El rol se elige con el botón: así no hace falta un selector dentro
    // del diálogo, que Ionic no ofrece junto a campos de texto.
    const { role, data } = await alert.onDidDismiss();
    if (role !== 'user' && role !== 'institucion') return;

    const v = data?.values ?? {};

    try {
      await this.usuarioService.crearUsuario({
        email: v.email,
        password: v.password,
        nombres: v.nombres,
        apellidoPaterno: v.apellidoPaterno,
        apellidoMaterno: v.apellidoMaterno,
        rut: v.rut,
        rol: role,
      });

      this.recargar$.next();
      await this.avisar('Cuenta creada. Entrégale el acceso a la persona.');
    } catch (err: any) {
      console.error('No se pudo crear:', err);
      await this.avisar(err?.message || 'No se pudo crear la cuenta.');
    }
  }

  /** Cambia el nombre o el correo de una cuenta. */
  async editarUsuario(u: UsuarioPerfil): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Editar cuenta',
      subHeader: u.email,
      cssClass: 'alerta-texto',
      inputs: [
        { name: 'nombres', type: 'text', value: u.nombres ?? '', placeholder: 'Nombres' },
        {
          name: 'apellidoPaterno',
          type: 'text',
          value: u.apellidoPaterno ?? '',
          placeholder: 'Apellido paterno',
        },
        {
          name: 'apellidoMaterno',
          type: 'text',
          value: u.apellidoMaterno ?? '',
          placeholder: 'Apellido materno (opcional)',
        },
        { name: 'email', type: 'email', value: u.email ?? '', placeholder: 'Correo' },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Cambiar rol', role: 'rol' },
        { text: 'Guardar', role: 'guardar' },
      ],
    });

    await alert.present();

    const { role, data } = await alert.onDidDismiss();

    if (role === 'rol') {
      await this.cambiarRol(u);
      return;
    }

    if (role !== 'guardar') return;

    const v = data?.values ?? {};

    try {
      await this.usuarioService.actualizarUsuario(u.uid, {
        nombres: v.nombres,
        apellidoPaterno: v.apellidoPaterno,
        apellidoMaterno: v.apellidoMaterno,
        email: v.email,
      });

      this.recargar$.next();
      await this.avisar('Cuenta actualizada.');
    } catch (err: any) {
      console.error('No se pudo actualizar:', err);
      await this.avisar(err?.message || 'No se pudo guardar el cambio.');
    }
  }

  /** El rol va aparte: cambia lo que la persona puede hacer, no sus datos. */
  private async cambiarRol(u: UsuarioPerfil): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Cambiar rol',
      subHeader: u.nombre || u.email,
      message: [
        'Estudiante: busca carreras y guarda favoritas.',
        '',
        'Institución: además solicita y paga planes.',
        '',
        'Administrador: gestiona todo el sistema.',
      ].join(String.fromCharCode(10)),
      cssClass: 'alerta-texto',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Estudiante', role: 'user' },
        { text: 'Institución', role: 'institucion' },
        { text: 'Administrador', role: 'admin' },
      ],
    });

    await alert.present();

    const { role } = await alert.onDidDismiss();
    if (role !== 'user' && role !== 'institucion' && role !== 'admin') return;

    if (role === u.rol) {
      await this.avisar('Ya tenía ese rol.');
      return;
    }

    try {
      await this.usuarioService.actualizarUsuario(u.uid, { rol: role });
      this.recargar$.next();
      await this.avisar('Rol actualizado.');
    } catch (err: any) {
      console.error('No se pudo cambiar el rol:', err);
      await this.avisar(err?.message || 'No se pudo cambiar el rol.');
    }
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
