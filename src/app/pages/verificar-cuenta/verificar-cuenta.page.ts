import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ToastController,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-verificar-cuenta',
  standalone: true,
  imports: [
    CommonModule,
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
  ],
  templateUrl: './verificar-cuenta.page.html',
})
export class VerificarCuentaPage {
  private authService = inject(AuthService);
  private toastCtrl = inject(ToastController);
  private router = inject(Router);


  async reenviar() {
    try {
      await this.authService.enviarVerificacion();
      const t = await this.toastCtrl.create({ message: 'Correo reenviado 📩', duration: 2000 });
      await t.present();
    } catch {
      const t = await this.toastCtrl.create({
        message: 'Inicia sesión primero para reenviar la verificación.',
        duration: 2500
      });
      await t.present();
      this.router.navigateByUrl('/auth', { replaceUrl: true });
    }
  }

  irLogin() {
    this.router.navigateByUrl('/auth', { replaceUrl: true });
  }
}
