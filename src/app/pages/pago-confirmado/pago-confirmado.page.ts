import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';

import { firstValueFrom } from 'rxjs';

import { PagosService, ResultadoRetorno } from 'src/app/services/pagos.service';
import { SolicitudesService } from 'src/app/services/solicitudes.service';
import { Pago, Solicitud } from 'src/app/models/planes.model';

@Component({
  selector: 'app-pago-confirmado',
  standalone: true,
  templateUrl: './pago-confirmado.page.html',
  styleUrls: ['./pago-confirmado.page.scss'],
  imports: [CommonModule, IonicModule],
})
export class PagoConfirmadoPage {
  private pagosService = inject(PagosService);
  private solicitudesService = inject(SolicitudesService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  resultado: ResultadoRetorno = 'error';
  pago: Pago | null = null;
  solicitud: Solicitud | null = null;

  cargando = true;
  motivo = '';

  constructor() {
    this.cargar();
  }

  private async cargar(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;

    this.resultado = (params.get('resultado') as ResultadoRetorno) || 'error';
    this.motivo = params.get('motivo') || '';

    const pagoId = params.get('pagoId');

    if (!pagoId) {
      this.cargando = false;
      return;
    }

    try {
      this.pago = await firstValueFrom(this.pagosService.getPago(pagoId));

      if (this.pago?.solicitudId) {
        this.solicitud = await firstValueFrom(
          this.solicitudesService.getSolicitud(this.pago.solicitudId)
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      this.cargando = false;
    }
  }

  get autorizado(): boolean {
    return this.resultado === 'ok' && this.pago?.estado === 'autorizado';
  }

  get titulo(): string {
    if (this.autorizado) return 'Pago confirmado';
    if (this.resultado === 'cancelado') return 'Pago cancelado';
    if (this.resultado === 'rechazado') return 'Pago rechazado';
    return 'No pudimos confirmar el pago';
  }

  get mensaje(): string {
    if (this.autorizado) {
      return 'La transacción fue aprobada correctamente y tu plan ya puede ser activado.';
    }
    if (this.resultado === 'cancelado') {
      return 'Anulaste el pago en Webpay. Puedes intentarlo nuevamente cuando quieras.';
    }
    if (this.resultado === 'rechazado') {
      return 'El pago fue rechazado por el emisor. Puedes intentar con otro medio de pago.';
    }
    return this.motivo
      ? this.pagosService.mensajeDeError(this.motivo)
      : 'Ocurrió un problema al verificar el pago. Si el cobro se realizó, contáctanos.';
  }

  irAlPanel(): void {
    this.router.navigate(['/tabs/institucion'], { replaceUrl: true });
  }

  /** Comprobante simple en una ventana nueva, listo para guardar o imprimir. */
  verComprobante(): void {
    if (!this.pago) return;

    const filas: Array<[string, string]> = [
      ['Orden de compra', this.pago.buyOrder],
      ['Plan', this.solicitud?.planNombre ?? '—'],
      ['Institución', this.solicitud?.nombreInstitucion ?? '—'],
      ['Monto pagado', this.formatearMonto(this.pago.amount)],
      ['Medio de pago', 'Webpay Plus'],
      ['Código de autorización', this.pago.authorizationCode ?? '—'],
      ['Fecha de transacción', this.formatearFechaTbk(this.pago.transactionDate)],
      ['Estado', this.autorizado ? 'Autorizada' : 'No autorizada'],
    ];

    const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Comprobante ${this.pago.buyOrder}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 40px; color: #1a1a1a; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #666; font-size: 13px; margin: 0 0 24px; }
  table { border-collapse: collapse; width: 100%; max-width: 560px; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e3e3e3; font-size: 14px; }
  th { color: #666; font-weight: 600; width: 45%; }
  td { font-weight: 700; }
  .nota { margin-top: 24px; font-size: 12px; color: #888; max-width: 560px; }
</style>
</head>
<body>
  <h1>Comprobante de pago</h1>
  <p class="sub">EligeTuFuturo</p>
  <table>
    ${filas.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}
  </table>
  <p class="nota">
    Documento generado por EligeTuFuturo. Transacción realizada en el ambiente
    de integración de Transbank: no corresponde a un cobro real.
  </p>
</body>
</html>`;

    const ventana = window.open('', '_blank');
    if (!ventana) return;

    ventana.document.write(html);
    ventana.document.close();
  }

  formatearMonto(monto: number | null): string {
    if (monto === null || monto === undefined) return '—';
    return monto.toLocaleString('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    });
  }

  /** Transbank devuelve la fecha como texto ISO. */
  formatearFechaTbk(valor: string | null): string {
    if (!valor) return '—';

    const f = new Date(valor);
    if (isNaN(f.getTime())) return valor;

    return f.toLocaleString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
