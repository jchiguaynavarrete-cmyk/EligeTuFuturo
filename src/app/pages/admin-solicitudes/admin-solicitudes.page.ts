import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';

import { Observable, of, firstValueFrom, BehaviorSubject } from 'rxjs';
import { catchError, map, startWith, switchMap } from 'rxjs/operators';

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

/**
 * Salto de línea para los mensajes de los diálogos.
 *
 * Ionic ya no interpreta HTML dentro de un `alert`, así que un `<br>`
 * se vería escrito en pantalla. Se usa texto plano y los saltos los
 * respeta la clase `alerta-texto` de global.scss.
 */
const SALTO = String.fromCharCode(10);


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

  estado$: Observable<EstadoPanel>;

  /** Id de la solicitud que se está guardando, para bloquear sus botones. */
  procesando: string | null = null;

  filtro: Filtro = 'todas';
  busqueda = '';

  /**
   * Pulso de recarga.
   *
   * La consulta a Supabase se resuelve una sola vez, a diferencia de las
   * escuchas en vivo de Firestore. Sin esto, al aprobar o rechazar la
   * tabla seguiría mostrando el estado anterior aunque la base ya hubiera
   * cambiado. Cada emisión vuelve a pedir la lista.
   */
  private recargar$ = new BehaviorSubject<void>(undefined);

  constructor() {
    this.estado$ = this.recargar$.pipe(
      switchMap(() =>
        this.solicitudesService.listarTodas().pipe(
          map((solicitudes) => ({ cargando: false, error: '', solicitudes })),
          catchError((err) => {
            console.error(err);

            const sinPermiso = err?.code === 'permission-denied';
            return of({
              cargando: false,
              solicitudes: [] as Solicitud[],
              error: sinPermiso
                ? 'La base rechazó la lectura. Revisa que las reglas permitan a un admin leer la colección "solicitudes".'
                : 'No se pudieron cargar las solicitudes.',
            });
          }),
          startWith({ cargando: true, error: '', solicitudes: [] as Solicitud[] })
        )
      )
    );
  }

  /** Vuelve a pedir la lista a la base. */
  private recargar(): void {
    this.recargar$.next();
  }

  /** Al volver a entrar en la pestaña, los datos se refrescan. */
  ionViewWillEnter(): void {
    this.recargar();
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

    // El plan ya trae su precio y no se negocia: solo se confirma.
    // Escribir el monto a mano queda reservado para los planes que se
    // cotizan caso a caso o que todavía no tienen precio definido.
    if (!plan.requiereCotizacion && sugerido !== null) {
      await this.confirmarAprobacionConPrecioFijo(s, plan, sugerido);
      return;
    }

    await this.pedirMonto(s, plan, sugerido);
  }

  /** Precio fijo: el monto lo define el plan, así que solo se confirma. */
  private async confirmarAprobacionConPrecioFijo(
    s: Solicitud,
    plan: any,
    monto: number
  ): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Aprobar solicitud',
      subHeader: `${s.nombreInstitucion} · ${s.planNombre}`,
      // Texto plano: Ionic ya no interpreta HTML dentro de los
      // diálogos, así que las etiquetas se verían escritas en pantalla.
      // Los saltos de línea los respeta la clase `alerta-texto`.
      message: [
        `${s.cantidadEstudiantes} estudiantes.`,
        '',
        `Monto según el plan: ${this.formatearMonto(monto)}`,
      ].join(SALTO),
      cssClass: 'alerta-texto',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Aprobar', role: 'aprobar' },
      ],
    });

    await alert.present();

    // El trabajo va FUERA del botón, después de que el diálogo se cerró.
    // Si se lanza desde dentro, el cartel de "Aprobando..." intenta
    // abrirse mientras el diálogo aún se cierra, Ionic no permite las dos
    // ventanas a la vez y la espera nunca termina: la escritura en la
    // base jamás se ejecuta, sin error ni aviso.
    const { role } = await alert.onDidDismiss();

    if (role !== 'aprobar') return;

    await this.guardarAprobacion(s, plan, `${monto}`);
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
        { text: 'Aprobar', role: 'aprobar' },
      ],
    });

    await alert.present();

    const { role, data } = await alert.onDidDismiss();
    if (role !== 'aprobar') return;

    await this.guardarAprobacion(s, plan, data?.values?.monto);
  }

  private async confirmarAprobacionSinPago(s: Solicitud, plan: any): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Aprobar solicitud',
      subHeader: `${s.nombreInstitucion} · ${s.planNombre}`,
      message:
        'Este plan no requiere pago, así que se activará de inmediato al aprobarlo.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Aprobar y activar', role: 'aprobar' },
      ],
    });

    await alert.present();

    const { role } = await alert.onDidDismiss();
    if (role !== 'aprobar') return;

    await this.guardarAprobacion(s, plan, '0');
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

    // Sin cartel de carga: superponer otra ventana justo después de
    // cerrar el diálogo es frágil y la operación dura unas décimas de
    // segundo. La fila deshabilitada ya indica que algo está pasando.
    this.procesando = s.id;

    try {
      await this.solicitudesService.aprobarSolicitud(s.id, adminUid, monto, plan);
      this.recargar();

      await this.mostrarToast(
        plan.requierePago
          ? 'Solicitud aprobada. La institución ya puede pagar.'
          : 'Solicitud aprobada y plan activado.'
      );
    } catch (err: any) {
      console.error(err);
      // Se muestra el motivo real: un mensaje genérico obliga a abrir
      // la consola del navegador para saber qué pasó.
      await this.mostrarToast(err?.message || 'No se pudo aprobar la solicitud.');
    } finally {
      this.procesando = null;
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
        { text: 'Rechazar', role: 'rechazar', cssClass: 'boton-peligro' },
      ],
    });

    await alert.present();

    const { role, data } = await alert.onDidDismiss();
    if (role !== 'rechazar') return;

    await this.guardarRechazo(s, data?.values?.motivo ?? '');
  }

  private async guardarRechazo(s: Solicitud, motivo: string): Promise<void> {
    const adminUid = this.authService.getUid();
    if (!adminUid) {
      await this.mostrarToast('Tu sesión expiró.');
      return;
    }

    this.procesando = s.id;

    try {
      await this.solicitudesService.rechazarSolicitud(s.id, adminUid, motivo);
      this.recargar();
      await this.mostrarToast('Solicitud rechazada.');
    } catch (err: any) {
      console.error(err);
      await this.mostrarToast(err?.message || 'No se pudo rechazar la solicitud.');
    } finally {
      this.procesando = null;
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
      message: filas.map(([k, v]) => `${k}: ${v}`).join(SALTO),
      buttons: ['Cerrar'],
      cssClass: 'alerta-texto alerta-detalle',
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
    // Los mensajes de error pueden ser largos: 2,6 s no alcanzaba para
    // leerlos, y el botón permite cerrarlo antes si molesta.
    const toast = await this.toastCtrl.create({
      message,
      duration: 6000,
      buttons: [{ text: 'Cerrar', role: 'cancel' }],
    });
    await toast.present();
  }

  trackPorId(_: number, s: Solicitud): string {
    return s.id;
  }
}
