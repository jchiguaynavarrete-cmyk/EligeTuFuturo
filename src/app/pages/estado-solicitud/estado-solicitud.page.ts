import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

import { Observable, of, combineLatest, BehaviorSubject } from 'rxjs';
import { catchError, map, startWith, switchMap } from 'rxjs/operators';

import { AuthService } from 'src/app/services/auth.service';
import { SolicitudesService } from 'src/app/services/solicitudes.service';
import {
  Solicitud,
  Institucion,
  ESTADO_SOLICITUD_META,
} from 'src/app/models/planes.model';

/** Los cuatro pasos del flujo, para pintarlos como línea de tiempo. */
export interface Paso {
  numero: number;
  titulo: string;
  detalle: string;
  estado: 'completado' | 'actual' | 'pendiente' | 'bloqueado';
}

type EstadoPanel = {
  cargando: boolean;
  error: string;
  solicitudes: Solicitud[];
  institucion: Institucion | null;
};

@Component({
  selector: 'app-estado-solicitud',
  standalone: true,
  templateUrl: './estado-solicitud.page.html',
  styleUrls: ['./estado-solicitud.page.scss'],
  imports: [
    CommonModule,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonSpinner,
    IonButton,
  ],
})
export class EstadoSolicitudPage {
  private authService = inject(AuthService);
  private solicitudesService = inject(SolicitudesService);
  private router = inject(Router);

  estado$: Observable<EstadoPanel>;

  /**
   * Pulso de recarga.
   *
   * Las consultas a Supabase se resuelven una sola vez. Sin esto, la
   * institución seguiría viendo "pendiente" después de que el
   * administrador aprobara, hasta recargar el navegador entero.
   */
  private recargar$ = new BehaviorSubject<void>(undefined);

  /** Al volver a entrar, se vuelve a consultar el estado real. */
  ionViewWillEnter(): void {
    this.recargar$.next();
  }

  constructor() {
    // Si llegó por el formulario público y después creó su cuenta, aquí
    // se le enlazan esas solicitudes. Es idempotente: si no hay ninguna,
    // no hace nada.
    this.solicitudesService.reclamarSolicitudesPublicas().catch(() => {});

    this.estado$ = combineLatest([this.authService.user$, this.recargar$]).pipe(
      switchMap(([user]) => {
        if (!user?.id) {
          return of({
            cargando: false,
            error: 'Debes iniciar sesión para ver tus solicitudes.',
            solicitudes: [] as Solicitud[],
            institucion: null,
          });
        }

        return combineLatest([
          this.solicitudesService.listarMisSolicitudes(user.id),
          this.solicitudesService.getInstitucion(user.id),
        ]).pipe(
          map(([solicitudes, institucion]) => ({
            cargando: false,
            error: '',
            solicitudes,
            institucion,
          })),
          catchError((err) => {
            console.error(err);
            return of({
              cargando: false,
              error: 'No pudimos cargar tus solicitudes.',
              solicitudes: [] as Solicitud[],
              institucion: null,
            });
          })
        );
      }),
      startWith({
        cargando: true,
        error: '',
        solicitudes: [] as Solicitud[],
        institucion: null,
      })
    );
  }

  /**
   * Arma la línea de tiempo según el estado real de la solicitud.
   * Un plan sin pago salta el paso 3.
   */
  pasosDe(s: Solicitud): Paso[] {
    const requierePago = s.estadoPago !== 'no_aplica';
    const rechazada = s.estado === 'rechazada';
    const aprobada = s.estado === 'aprobada';
    const pagado = s.estadoPago === 'pagado';

    const pasos: Paso[] = [
      {
        numero: 1,
        titulo: 'Solicitud enviada',
        detalle: 'Tu solicitud fue recibida correctamente.',
        estado: 'completado',
      },
      {
        numero: 2,
        titulo: 'Revisión administrativa',
        detalle: rechazada
          ? 'Tu solicitud fue rechazada.'
          : aprobada
            ? 'Hemos revisado tu información.'
            : 'Tu solicitud se encuentra en revisión.',
        estado: rechazada ? 'bloqueado' : aprobada ? 'completado' : 'actual',
      },
    ];

    if (requierePago) {
      pasos.push({
        numero: 3,
        titulo: 'Pago con Webpay',
        detalle: pagado
          ? 'El pago fue confirmado.'
          : 'Completa el pago para activar tu plan.',
        estado: rechazada
          ? 'bloqueado'
          : pagado
            ? 'completado'
            : aprobada
              ? 'actual'
              : 'pendiente',
      });
    }

    pasos.push({
      numero: requierePago ? 4 : 3,
      titulo: 'Activación del plan',
      detalle: requierePago
        ? 'Tu plan se activará después de confirmar el pago.'
        : 'Tu plan se activa al ser aprobado.',
      estado: rechazada
        ? 'bloqueado'
        : (requierePago ? pagado : aprobada)
          ? 'completado'
          : 'pendiente',
    });

    return pasos;
  }

  /** Solo se puede pagar una solicitud aprobada, con monto y sin pagar aún. */
  puedePagar(s: Solicitud): boolean {
    return (
      s.estado === 'aprobada' &&
      s.estadoPago === 'pendiente' &&
      s.monto !== null &&
      s.monto > 0
    );
  }

  esperandoMonto(s: Solicitud): boolean {
    return s.estado === 'aprobada' && s.estadoPago === 'pendiente' && !s.monto;
  }

  irAPagar(s: Solicitud): void {
    this.router.navigate(['/tabs/institucion/pagar', s.id]);
  }

  verPlanes(): void {
    this.router.navigate(['/tabs/planes']);
  }

  textoEstado(s: Solicitud): string {
    return ESTADO_SOLICITUD_META[s.estado].texto;
  }

  colorEstado(s: Solicitud): string {
    return ESTADO_SOLICITUD_META[s.estado].color;
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

  trackPorId(_: number, s: Solicitud): string {
    return s.id;
  }
}
