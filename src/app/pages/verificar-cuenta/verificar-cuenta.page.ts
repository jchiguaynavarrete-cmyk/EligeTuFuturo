import { Component, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ToastController,
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonToolbar,
} from '@ionic/angular/standalone';
import { Router } from '@angular/router';

import { addIcons } from 'ionicons';
import {
  checkmarkOutline,
  informationCircleOutline,
  mailOutline,
  refreshOutline,
} from 'ionicons/icons';

import { AuthService } from 'src/app/services/auth.service';

/**
 * Espera entre reenvíos.
 *
 * El servicio de correo tiene un tope de envíos por hora. Sin este freno,
 * apretar el botón varias veces no manda más correos: agota la cuota y los
 * siguientes fallan sin que se entienda por qué.
 */
const SEGUNDOS_ESPERA = 60;

@Component({
  selector: 'app-verificar-cuenta',
  standalone: true,
  imports: [
    CommonModule,
    IonButton,
    IonContent,
    IonHeader,
    IonIcon,
    IonToolbar,
  ],
  templateUrl: './verificar-cuenta.page.html',
  styleUrls: ['./verificar-cuenta.page.scss'],
})
export class VerificarCuentaPage implements OnDestroy {
  private authService = inject(AuthService);
  private toastCtrl = inject(ToastController);
  private router = inject(Router);

  /** Se muestra en pantalla para que se vea a qué dirección se envió. */
  readonly correo = this.authService.getCurrentUser()?.email ?? '';

  segundosRestantes = 0;
  private cuenta?: ReturnType<typeof setInterval>;

  constructor() {
    addIcons({
      checkmarkOutline,
      informationCircleOutline,
      mailOutline,
      refreshOutline,
    });
  }

  ngOnDestroy(): void {
    this.detenerCuenta();
  }

  async reenviar(): Promise<void> {
    if (this.segundosRestantes > 0) return;

    try {
      await this.authService.enviarVerificacion();
      this.iniciarCuenta();
      await this.avisar('Correo reenviado. Revisa tu bandeja.');
    } catch {
      await this.avisar('Inicia sesión primero para reenviar la verificación.');
      this.router.navigateByUrl('/auth', { replaceUrl: true });
    }
  }

  irLogin(): void {
    this.router.navigateByUrl('/auth', { replaceUrl: true });
  }

  private iniciarCuenta(): void {
    this.detenerCuenta();
    this.segundosRestantes = SEGUNDOS_ESPERA;

    this.cuenta = setInterval(() => {
      this.segundosRestantes--;
      if (this.segundosRestantes <= 0) this.detenerCuenta();
    }, 1000);
  }

  private detenerCuenta(): void {
    if (this.cuenta) {
      clearInterval(this.cuenta);
      this.cuenta = undefined;
    }
  }

  private async avisar(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 2600 });
    await toast.present();
  }
}
