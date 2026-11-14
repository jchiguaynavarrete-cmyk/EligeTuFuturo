import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastController } from '@ionic/angular';

/**
 * Aviso para el estudiante cuyo establecimiento aún no tiene convenio.
 *
 * En vez de dejarlo en un callejón sin salida, le da algo que hacer:
 * compartirle el enlace institucional a su director u orientador. Quien
 * decide contratar no es el estudiante, pero sí puede abrir la conversación.
 */
@Component({
  selector: 'app-aviso-sin-convenio',
  standalone: true,
  templateUrl: './aviso-sin-convenio.component.html',
  styleUrls: ['./aviso-sin-convenio.component.scss'],
  imports: [CommonModule],
})
export class AvisoSinConvenioComponent {
  /** Nombre de la función bloqueada, para que el aviso sea específico. */
  @Input() funcion = 'esta función';

  private toastCtrl = inject(ToastController);

  copiado = false;

  /** Enlace público de la landing institucional. */
  get enlace(): string {
    return `${window.location.origin}/institucional`;
  }

  get mensaje(): string {
    return (
      'Hola, en mi colegio estamos eligiendo carrera y encontré EligeTuFuturo: ' +
      'ayuda a comparar carreras y simular el puntaje PAES. ' +
      `Tiene un plan para establecimientos, ¿lo podríamos ver? ${this.enlace}`
    );
  }

  compartirWhatsapp(): void {
    const url = `https://wa.me/?text=${encodeURIComponent(this.mensaje)}`;
    window.open(url, '_blank', 'noopener');
  }

  async copiarEnlace(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.enlace);
      this.copiado = true;
      await this.mostrarToast('Enlace copiado. Compártelo con tu director u orientador.');

      setTimeout(() => (this.copiado = false), 2500);
    } catch {
      // Algunos navegadores bloquean el portapapeles sin gesto directo.
      await this.mostrarToast(`Copia este enlace: ${this.enlace}`);
    }
  }

  private async mostrarToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 3200 });
    await toast.present();
  }
}
