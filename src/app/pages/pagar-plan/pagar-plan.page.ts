import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { IonicModule, ToastController } from '@ionic/angular';

import { firstValueFrom } from 'rxjs';

import { SolicitudesService } from 'src/app/services/solicitudes.service';
import { PagosService } from 'src/app/services/pagos.service';
import { AuthService } from 'src/app/services/auth.service';
import { Solicitud } from 'src/app/models/planes.model';

@Component({
  selector: 'app-pagar-plan',
  standalone: true,
  templateUrl: './pagar-plan.page.html',
  styleUrls: ['./pagar-plan.page.scss'],
  imports: [CommonModule, IonicModule],
})
export class PagarPlanPage {
  private solicitudesService = inject(SolicitudesService);
  private pagosService = inject(PagosService);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toastCtrl = inject(ToastController);

  solicitud: Solicitud | null = null;
  cargando = true;
  error = '';
  procesando = false;

  constructor() {
    this.cargar();
  }

  private async cargar(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('solicitudId');

    if (!id) {
      this.error = 'No se indicó qué solicitud pagar.';
      this.cargando = false;
      return;
    }

    try {
      const s = await firstValueFrom(this.solicitudesService.getSolicitud(id));

      if (!s) {
        this.error = 'No encontramos la solicitud.';
      } else if (s.uidSolicitante !== this.authService.getUid()) {
        this.error = 'Esta solicitud no te pertenece.';
      } else if (s.estado !== 'aprobada') {
        this.error = 'La solicitud todavía no está aprobada.';
      } else if (s.estadoPago === 'pagado') {
        this.error = 'Esta solicitud ya fue pagada.';
      } else if (!s.monto || s.monto <= 0) {
        this.error = 'El administrador aún no define el monto a pagar.';
      } else {
        this.solicitud = s;
      }
    } catch (err) {
      console.error(err);
      this.error = 'No pudimos cargar la solicitud.';
    } finally {
      this.cargando = false;
    }
  }

  /** Pide la transacción al backend y envía a Webpay. */
  /*
   * Sin cartel de carga a propósito.
   *
   * Antes se abría uno de Ionic justo antes de llamar al servidor. Si
   * ese cartel se queda esperando -y las ventanas superpuestas de Ionic
   * lo hacen cuando otra se está cerrando al mismo tiempo-, la línea
   * siguiente nunca corre: la petición no se envía, y el botón se queda
   * deshabilitado para siempre sin que aparezca nada en pantalla.
   *
   * El botón ya dice "Conectando con Transbank" mientras espera, que es
   * lo mismo que informaba el cartel, sin el riesgo de trabarse.
   */
  async pagar(): Promise<void> {
    if (!this.solicitud || this.procesando) return;

    this.procesando = true;

    try {
      const r = await this.pagosService.crearPago(this.solicitud.id);
      // A partir de aquí la navegación la toma Transbank.
      this.pagosService.redirigirAWebpay(r.url, r.token);
    } catch (err: any) {
      console.error(err);
      this.procesando = false;

      await this.mostrarToast(this.pagosService.mensajeDeError(err?.message));
    }
  }

  volver(): void {
    this.router.navigate(['/tabs/institucion']);
  }

  formatearMonto(monto: number | null): string {
    if (monto === null) return '—';
    return monto.toLocaleString('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    });
  }

  private async mostrarToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 3200 });
    await toast.present();
  }
}
