import { Component, inject } from '@angular/core';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonCard,
  IonCardContent,
  IonButton,
  AlertController,
} from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-calendario',
  templateUrl: './calendario.page.html',
  styleUrls: ['./calendario.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonCard,
    IonCardContent,
    IonButton,
  ],
})
export class CalendarioPage {
  private alertCtrl = inject(AlertController);


  fechas = [
    {
      titulo: 'Inicio inscripción PAES',
      fecha: new Date('2025-06-01'),
    },
    {
      titulo: 'Cierre inscripción PAES',
      fecha: new Date('2025-07-10'),
    },
    {
      titulo: 'Rendición PAES',
      fecha: new Date('2025-11-25'),
    },
    {
      titulo: 'Resultados PAES',
      fecha: new Date('2026-01-05'),
    },
  ];

  diasRestantes(fecha: Date): number {
    const hoy = new Date();
    const diff = fecha.getTime() - hoy.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  async mostrarAlerta(evento: any) {
    const alert = await this.alertCtrl.create({
      header: '📢 Recordatorio',
      message: `${evento.titulo}\n\nFecha: ${evento.fecha.toLocaleDateString('es-CL')}`,
      buttons: ['Entendido'],
    });

    await alert.present();
  }
}
