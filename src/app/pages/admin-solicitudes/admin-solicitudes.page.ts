import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, AlertController, ToastController, LoadingController } from '@ionic/angular';

import { Observable, of, firstValueFrom } from 'rxjs';
import { catchError, map, startWith } from 'rxjs/operators';

import { SolicitudesService } from 'src/app/services/solicitudes.service';
import { PlanesService } from 'src/app/services/planes.service';
import { AuthService } from 'src/app/services/auth.service';
import {
  Solicitud,
  EstadoSolicitud,
  ESTADO_SOLICITUD_META,
} from 'src/app/models/planes.model';

type Filtro = 'todas' | EstadoSolicitud;

type EstadoPanel = {
  cargando: boolean;
  error: string;
  solicitudes: Solicitud[];
};

@Component({
  selector: 'app-admin-solicitudes',
  standalone: true,
  templateUrl: './admin-solicitudes.page.html',
  styleUrls: ['./admin-solicitudes.page.scss'],
  imports: [CommonModule, FormsModule, IonicModule],
})
export class AdminSolicitudesPage {
  private solicitudesService = inject(SolicitudesService);
  private planesService = inject(PlanesService);
  private authService = inject(AuthService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private loadingCtrl = inject(LoadingController);

  estado$: Observable<EstadoPanel>;

  filtro: Filtro = 'todas';
  busqueda = '';

  constructor() {
    this.estado$ = this.solicitudesService.listarTodas().pipe(
      map((solicitudes) => ({ cargando: false, error: '', solicitudes })),
      catchError((err) => {
        console.error(err);

        const sinPermiso = err?.code === 'permission-denied';
        return of({
          cargando: false,
          solicitudes: [] as Solicitud[],
          error: sinPermiso
            ? 'Firestore rechazó la lectura. Revisa que las reglas permitan a un admin leer la colección "solicitudes".'
            : 'No se pudieron cargar las solicitudes.',
        });
      }),
      startWith({ cargando: true, error: '', solicitudes: [] as Solicitud[] })
    );
  }

  /** Conteo real por estado, para las pestañas de filtro. */
  contar(solicitudes: Solicitud[], filtro: Filtro): number {
    if (filtro === 'todas') return solicitudes.length;
    return solicitudes.filter((s) => s.estado === filtro).length;
  }

  filtrar(solicitudes: Solicitud[]): Solicitud[] {
    const termino = this.busqueda.trim().toLowerCase();

    return solicitudes
      .filter((s) => this.filtro === 'todas' || s.estado === this.filtro)
      .filter((s) => {
        if (!termino) return true;
        return [s.nombreInstitucion, s.correo, s.rbd, s.encargado].some((campo) =>
          (campo || '').toLowerCase().includes(termino)
        );
      });
  }

  cambiarFiltro(filtro: Filtro): void {
    this.filtro = filtro;
  }

  // ---------------- Acciones ----------------
  async aprobar(s: Solicitud): Promise<void> {
    const plan = await firstValueFrom(this.planesService.getPlan(s.planId));

    if (!plan) {
      await this.mostrarToast('No encontramos el plan de esta solicitud.');
      return;
    }

    // Un plan sin pago se activa de inmediato; no tiene sentido pedir monto.
    if (!plan.requierePago) {
      await this.confirmarAprobacionSinPago(s, plan);
      return;
    }

    const sugerido = s.monto ?? plan.precio ?? null;

    // El plan ya trae su precio: no hay por qué hacer teclearlo de nuevo.
    // Solo se pide escribirlo cuando el valor es a medida (cotización) o
    // cuando el plan todavía no tiene precio definido.
    if (!plan.requiereCotizacion && sugerido !== null) {
      await this.confirmarAprobacionConPrecioFijo(s, plan, sugerido);
      return;
    }

    await this.pedirMonto(s, plan, sugerido);
  }

  /** Precio fijo: un clic para aprobar, con la opción de ajustarlo. */
  private async confirmarAprobacionConPrecioFijo(
    s: Solicitud,
    plan: any,
    monto: number
  ): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Aprobar solicitud',
      subHeader: `${s.nombreInstitucion} · ${s.planNombre}`,
      message:
        `${s.cantidadEstudiantes} estudiantes.<br><br>` +
        `Monto según el plan: <strong>${this.formatearMonto(monto)}</strong>`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Ajustar monto',
          handler: () => {
            this.pedirMonto(s, plan, monto);
          },
        },
        {
          text: 'Aprobar',
          handler: () => {
            this.guardarAprobacion(s, plan, `${monto}`);
          },
        },
      ],
    });

    await alert.present();
  }

  /** Cuando el valor es a medida o el plan no tiene precio definido. */
  private async pedirMonto(
    s: Solicitud,
    plan: any,
    sugerido: number | null
  ): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: plan.requiereCotizacion ? 'Definir cotización' : 'Aprobar solicitud',
      subHeader: `${s.nombreInstitucion} · ${s.planNombre}`,
      message: plan.requiereCotizacion
        ? `${s.cantidadEstudiantes} estudiantes. Este plan se cotiza caso a caso.`
        : `${s.cantidadEstudiantes} estudiantes. Define el monto a pagar.`,
      inputs: [
        {
          name: 'monto',
          type: 'number',
          placeholder: 'Monto en CLP (ej: 2250000)',
          min: 1,
          value: sugerido !== null ? `${sugerido}` : '',
        },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Aprobar',
          handler: (data) => {
            this.guardarAprobacion(s, plan, data?.monto);
          },
        },
      ],
    });

    await alert.present();
  }

  private async confirmarAprobacionSinPago(s: Solicitud, plan: any): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Aprobar solicitud',
      subHeader: `${s.nombreInstitucion} · ${s.planNombre}`,
      message:
        'Este plan no requiere pago, así que se activará de inmediato al aprobarlo.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Aprobar y activar',
          handler: () => {
            this.guardarAprobacion(s, plan, '0');
          },
        },
      ],
    });

    await alert.present();
  }

  private async guardarAprobacion(
    s: Solicitud,
    plan: any,
    montoBruto: string
  ): Promise<void> {
    const monto = Number(montoBruto);

    if (plan.requierePago && (!Number.isFinite(monto) || monto <= 0)) {
      await this.mostrarToast('Ingresa un monto válido mayor que cero.');
      return;
    }

    const adminUid = this.authService.getUid();
    if (!adminUid) {
      await this.mostrarToast('Tu sesión expiró.');
      return;
    }

    const loading = await this.loadingCtrl.create({ message: 'Aprobando...' });
    await loading.present();

    try {
      await this.solicitudesService.aprobarSolicitud(s.id, adminUid, monto, plan);
      await loading.dismiss();

      await this.mostrarToast(
        plan.requierePago
          ? 'Solicitud aprobada. La institución ya puede pagar.'
          : 'Solicitud aprobada y plan activado.'
      );
    } catch (err) {
      console.error(err);
      await loading.dismiss();
      await this.mostrarToast('No se pudo aprobar la solicitud.');
    }
  }

  async rechazar(s: Solicitud): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Rechazar solicitud',
      subHeader: `${s.nombreInstitucion} · ${s.planNombre}`,
      message: 'Indica el motivo. La institución lo verá en su panel.',
      inputs: [
        {
          name: 'motivo',
          type: 'textarea',
          placeholder: 'Motivo del rechazo',
        },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Rechazar',
          role: 'destructive',
          handler: (data) => {
            this.guardarRechazo(s, data?.motivo ?? '');
          },
        },
      ],
    });

    await alert.present();
  }

  private async guardarRechazo(s: Solicitud, motivo: string): Promise<void> {
    const adminUid = this.authService.getUid();
    if (!adminUid) {
      await this.mostrarToast('Tu sesión expiró.');
      return;
    }

    const loading = await this.loadingCtrl.create({ message: 'Rechazando...' });
    await loading.present();

    try {
      await this.solicitudesService.rechazarSolicitud(s.id, adminUid, motivo);
      await loading.dismiss();
      await this.mostrarToast('Solicitud rechazada.');
    } catch (err) {
      console.error(err);
      await loading.dismiss();
      await this.mostrarToast('No se pudo rechazar la solicitud.');
    }
  }

  async verDetalle(s: Solicitud): Promise<void> {
    const filas = [
      ['Institución', s.nombreInstitucion],
      ['RBD', s.rbd],
      ['Encargado', s.encargado],
      ['Correo', s.correo],
      ['Teléfono', s.telefono || '—'],
      ['Estudiantes', `${s.cantidadEstudiantes}`],
      ['Plan', s.planNombre],
      ['Estado', ESTADO_SOLICITUD_META[s.estado].texto],
      ['Monto', this.formatearMonto(s.monto)],
      ['Estado de pago', s.estadoPago],
      ['Solicitado', this.formatearFecha(s.fechaSolicitud)],
      ['Resuelto', this.formatearFecha(s.fechaResolucion)],
    ];

    const alert = await this.alertCtrl.create({
      header: 'Detalle de la solicitud',
      message: filas.map(([k, v]) => `<strong>${k}:</strong> ${v}`).join('<br>'),
      buttons: ['Cerrar'],
      cssClass: 'alerta-detalle',
    });

    await alert.present();
  }

  // ---------------- Utilidades ----------------
  textoEstado(s: Solicitud): string {
    return ESTADO_SOLICITUD_META[s.estado].texto;
  }

  formatearMonto(monto: number | null): string {
    if (monto === null) return 'Por definir';
    return monto.toLocaleString('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    });
  }

  formatearFecha(valor: any): string {
    const f = valor?.toDate?.() ?? (valor ? new Date(valor) : null);
    if (!f || isNaN(f.getTime())) return '—';

    return f.toLocaleDateString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  private async mostrarToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 2600 });
    await toast.present();
  }

  trackPorId(_: number, s: Solicitud): string {
    return s.id;
  }
}
