import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonContent,
  IonHeader,
  IonToolbar,
} from '@ionic/angular/standalone';
import { AlertController, ToastController, LoadingController } from '@ionic/angular';
import { RouterModule } from '@angular/router';

import { PlanesService } from 'src/app/services/planes.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    IonContent,
    IonHeader,
    IonToolbar,
  ],
  templateUrl: './admin.page.html',
  styleUrls: ['./admin.page.scss'],
})
export class AdminPage {
  private planesService = inject(PlanesService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private loadingCtrl = inject(LoadingController);

  /**
   * Crea o actualiza en la base los cinco planes de la evaluación del
   * proyecto y desactiva el antiguo Plan Red Educativa.
   */
  async sincronizarPlanes(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Crear o actualizar planes',
      message:
        'Se dejarán los planes Escolar ($1.200.000), Comunal ($5.500.000), ' +
        'Territorial ($10.000.000), Piloto (sin costo) y Convenio Nacional ' +
        '(a convenir). Se reemplazan sus textos y precios, y el antiguo Plan ' +
        'Red Educativa queda desactivado. Las solicitudes ya enviadas no cambian.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Actualizar', role: 'actualizar' },
      ],
    });

    await alert.present();

    // El trabajo va después del cierre: si se lanza desde el botón, el
    // cartel de carga choca con el diálogo que aún se cierra y la espera
    // no termina nunca.
    const { role } = await alert.onDidDismiss();
    if (role !== 'actualizar') return;

    await this.ejecutarSincronizacion();
  }

  private async ejecutarSincronizacion(): Promise<void> {
    const loading = await this.loadingCtrl.create({ message: 'Actualizando planes...' });
    await loading.present();

    try {
      const { actualizados, desactivados } = await this.planesService.sincronizarPlanes();
      await loading.dismiss();

      await this.mostrarToast(
        `Planes actualizados: ${actualizados}.` +
          (desactivados > 0 ? ` Planes antiguos desactivados: ${desactivados}.` : '')
      );
    } catch (err) {
      console.error(err);
      await loading.dismiss();
      await this.mostrarToast(
        'No se pudieron actualizar los planes. Revisa las políticas de la base.'
      );
    }
  }

  private async mostrarToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 2800 });
    await toast.present();
  }
}
