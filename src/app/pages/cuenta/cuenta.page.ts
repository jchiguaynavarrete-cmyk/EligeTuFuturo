import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';

import {
  IonContent,
  IonHeader,
  IonToolbar,
} from '@ionic/angular/standalone';

import { AuthService } from 'src/app/services/auth.service';
import { UsuarioService, UsuarioPerfil } from 'src/app/services/usuario.service';
import { Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

const SALTO = String.fromCharCode(10);

@Component({
  selector: 'app-cuenta',
  standalone: true,
  templateUrl: './cuenta.page.html',
  styleUrls: ['./cuenta.page.scss'],
  imports: [
    CommonModule,
    RouterModule,
    IonContent,
    IonHeader,
    IonToolbar,
  ],
})
export class CuentaPage {
  private authService = inject(AuthService);
  private usuarioService = inject(UsuarioService);
  private router = inject(Router);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  perfil$: Observable<UsuarioPerfil | null>;

  constructor() {
    this.perfil$ = this.authService.user$.pipe(
      switchMap((u) => (u?.id ? this.usuarioService.getUsuario(u.id) : of(null)))
    );
  }

  getIniciales(nombre?: string | null): string {
    const n = (nombre || '').trim();
    if (!n) return 'U';
    const parts = n.split(' ').filter(Boolean);
    const a = parts[0]?.[0] ?? 'U';
    const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
    return (a + b).toUpperCase();
  }

  formatearFecha(fecha: any): string {
    try {
      const d: Date =
        fecha?.toDate?.() instanceof Date ? fecha.toDate() :
        fecha instanceof Date ? fecha :
        new Date(fecha);

      if (isNaN(d.getTime())) return '—';
      return new Intl.DateTimeFormat('es-CL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(d);
    } catch {
      return '—';
    }
  }

  /**
   * Cambia la contraseña sin salir de la aplicación.
   *
   * Hasta ahora la única forma era el correo de recuperación. Eso dejaba
   * atrapadas a las instituciones, que entran con una clave temporal
   * entregada por el administrador.
   */
  async cambiarPassword(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Cambiar contraseña',
      message: [
        'Debe tener al menos 8 caracteres, con una mayúscula, una',
        'minúscula, un número y un símbolo.',
      ].join(' '),
      cssClass: 'alerta-texto',
      inputs: [
        { name: 'nueva', type: 'password', placeholder: 'Contraseña nueva' },
        { name: 'repetir', type: 'password', placeholder: 'Repítela' },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Guardar', role: 'guardar' },
      ],
    });

    await alert.present();

    // El trabajo va después del cierre del diálogo: abrir un aviso encima
    // de uno que aún se cierra deja la espera colgada para siempre.
    const { role, data } = await alert.onDidDismiss();
    if (role !== 'guardar') return;

    const nueva = data?.values?.nueva ?? '';
    const repetir = data?.values?.repetir ?? '';

    const problema = this.revisarPassword(nueva, repetir);
    if (problema) {
      await this.avisar(problema);
      return;
    }

    try {
      await this.authService.cambiarPassword(nueva);
      await this.avisar('Listo. Tu contraseña quedó cambiada.');
    } catch (err: any) {
      console.error('No se pudo cambiar la contraseña:', err);
      await this.avisar(
        this.authService.mensajeDeError?.(err) ||
          'No pudimos cambiar la contraseña. Inténtalo de nuevo.'
      );
    }
  }

  /** Las mismas reglas que exige el registro. Devuelve el problema, o vacío. */
  private revisarPassword(nueva: string, repetir: string): string {
    if (!nueva || !repetir) return 'Escribe la contraseña nueva en los dos campos.';
    if (nueva !== repetir) return 'Las contraseñas no coinciden.';
    if (nueva.length < 8) return 'Debe tener al menos 8 caracteres.';
    if (nueva.length > 64) return 'No puede superar los 64 caracteres.';
    if (!/[A-ZÁÉÍÓÚÑ]/.test(nueva)) return 'Le falta una mayúscula.';
    if (!/[a-záéíóúñ]/.test(nueva)) return 'Le falta una minúscula.';
    if (!/[0-9]/.test(nueva)) return 'Le falta un número.';
    if (!/[^A-Za-z0-9]/.test(nueva)) return 'Le falta un símbolo.';
    if (/\s/.test(nueva)) return 'No puede llevar espacios.';
    return '';
  }

  async cerrarSesion(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Cerrar sesión',
      message: 'Tendrás que volver a entrar con tu correo y contraseña.',
      cssClass: 'alerta-texto',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Cerrar sesión', role: 'salir', cssClass: 'boton-peligro' },
      ],
    });

    await alert.present();

    const { role } = await alert.onDidDismiss();
    if (role !== 'salir') return;

    await this.authService.logout();
    this.router.navigateByUrl('/auth', { replaceUrl: true });
  }

  private async avisar(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3500,
      buttons: [{ text: 'Cerrar', role: 'cancel' }],
    });
    await toast.present();
  }
}
