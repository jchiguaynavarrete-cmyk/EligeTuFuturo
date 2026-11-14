import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonicModule, LoadingController, ToastController } from '@ionic/angular';

import { firstValueFrom } from 'rxjs';

import { PlanesService } from 'src/app/services/planes.service';
import { SolicitudesService } from 'src/app/services/solicitudes.service';
import { AuthService } from 'src/app/services/auth.service';
import { Plan, PlanId } from 'src/app/models/planes.model';

type CampoSolicitud =
  | 'nombreInstitucion'
  | 'rbd'
  | 'encargado'
  | 'correo'
  | 'telefono'
  | 'cantidadEstudiantes';

@Component({
  selector: 'app-solicitud-plan',
  standalone: true,
  templateUrl: './solicitud-plan.page.html',
  styleUrls: ['./solicitud-plan.page.scss'],
  imports: [CommonModule, FormsModule, IonicModule],
})
export class SolicitudPlanPage {
  private planesService = inject(PlanesService);
  private solicitudesService = inject(SolicitudesService);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private loadingCtrl = inject(LoadingController);
  private toastCtrl = inject(ToastController);

  plan: Plan | null = null;
  cargando = true;
  errorCarga = '';

  nombreInstitucion = '';
  rbd = '';
  encargado = '';
  correo = '';
  telefono = '';
  cantidadEstudiantes: number | null = null;

  /**
   * Mismo criterio que en el registro: el campo solo muestra su resultado
   * cuando la persona sale de él o envía el formulario.
   */
  salido: Record<CampoSolicitud, boolean> = {
    nombreInstitucion: false,
    rbd: false,
    encargado: false,
    correo: false,
    telefono: false,
    cantidadEstudiantes: false,
  };

  constructor() {
    this.cargarPlan();
  }

  private async cargarPlan(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('planId') as PlanId | null;

    if (!id) {
      this.errorCarga = 'No se indicó qué plan solicitar.';
      this.cargando = false;
      return;
    }

    try {
      const plan = await firstValueFrom(this.planesService.getPlan(id));

      if (!plan || !plan.activo) {
        this.errorCarga = 'Este plan no está disponible.';
      } else {
        this.plan = plan;
      }
    } catch (err) {
      console.error(err);
      this.errorCarga = 'No pudimos cargar el plan. Intenta nuevamente.';
    } finally {
      this.cargando = false;
    }
  }

  marcarSalida(campo: CampoSolicitud): void {
    this.salido[campo] = true;
  }

  /** Al escribir se oculta el error hasta que vuelva a salir del campo. */
  alEscribir(campo: CampoSolicitud): void {
    this.salido[campo] = false;
  }

  /** Solo dígitos: el RBD y la cantidad de estudiantes son numéricos. */
  soloDigitos(valor: string, maxLargo: number): string {
    return (valor || '').replace(/\D/g, '').slice(0, maxLargo);
  }

  onRbdInput(event: any): void {
    const limpio = this.soloDigitos(event?.detail?.value ?? '', 6);
    this.rbd = limpio;
    this.alEscribir('rbd');

    if (event?.target && event.target.value !== limpio) {
      event.target.value = limpio;
    }
  }

  onTelefonoInput(event: any): void {
    // Se permite el + inicial de los números internacionales.
    const bruto = (event?.detail?.value ?? '') as string;
    const limpio = bruto.replace(/[^\d+ ]/g, '').slice(0, 16);

    this.telefono = limpio;
    this.alEscribir('telefono');

    if (event?.target && event.target.value !== limpio) {
      event.target.value = limpio;
    }
  }

  // ---------------- Validación ----------------
  /** Regla pura de cada campo: devuelve el error exista o no marca de salida. */
  private validar(campo: CampoSolicitud): string {
    switch (campo) {
      case 'nombreInstitucion': {
        const v = this.nombreInstitucion.trim();
        if (!v) return 'Ingresa el nombre de la institución.';
        if (v.length < 3) return 'El nombre es demasiado corto.';
        if (v.length > 80) return 'El nombre es demasiado largo.';
        return '';
      }

      case 'rbd': {
        const v = this.rbd.trim();
        if (!v) return 'Ingresa el RBD.';
        // El RBD chileno tiene entre 3 y 6 dígitos.
        if (v.length < 3) return 'El RBD debe tener al menos 3 dígitos.';
        if (Number(v) === 0) return 'El RBD no es válido.';
        return '';
      }

      case 'encargado': {
        const v = this.encargado.trim();
        if (!v) return 'Ingresa el nombre del encargado.';
        if (v.split(/\s+/).filter(Boolean).length < 2) return 'Escribe nombre y apellido.';
        if (!/[a-záéíóúñü]/i.test(v)) return 'Revisa el nombre del encargado.';
        return '';
      }

      case 'correo': {
        const v = this.correo.trim();
        if (!v) return 'Ingresa el correo de contacto.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'El correo no es válido.';
        return '';
      }

      case 'telefono': {
        // Es opcional: vacío es válido.
        const v = this.telefono.replace(/[^\d]/g, '');
        if (!v) return '';
        if (v.length < 8) return 'El teléfono está incompleto.';
        return '';
      }

      case 'cantidadEstudiantes': {
        const v = this.cantidadEstudiantes;
        if (v === null || v === undefined || `${v}` === '') {
          return 'Indica la cantidad de estudiantes.';
        }
        if (!Number.isInteger(Number(v)) || Number(v) <= 0) {
          return 'Debe ser un número mayor que cero.';
        }
        if (Number(v) > 100000) return 'La cantidad parece demasiado alta.';
        return '';
      }
    }
  }

  /** Error visible: solo después de salir del campo o de enviar. */
  errorDe(campo: CampoSolicitud): string {
    return this.salido[campo] ? this.validar(campo) : '';
  }

  campoCorrecto(campo: CampoSolicitud): boolean {
    return this.salido[campo] && !this.validar(campo);
  }

  get formularioValido(): boolean {
    return (Object.keys(this.salido) as CampoSolicitud[]).every(
      (campo) => !this.validar(campo)
    );
  }

  // ---------------- Envío ----------------
  async enviar(): Promise<void> {
    (Object.keys(this.salido) as CampoSolicitud[]).forEach(
      (c) => (this.salido[c] = true)
    );

    if (!this.plan) return;

    if (!this.formularioValido) {
      await this.mostrarToast('Revisa los campos marcados en rojo.');
      return;
    }

    const uid = this.authService.getUid();
    if (!uid) {
      await this.mostrarToast('Tu sesión expiró. Vuelve a iniciar sesión.');
      this.router.navigateByUrl('/auth', { replaceUrl: true });
      return;
    }

    const loading = await this.loadingCtrl.create({ message: 'Enviando solicitud...' });
    await loading.present();

    try {
      const solicitudId = await this.solicitudesService.crearSolicitud(uid, this.plan, {
        nombreInstitucion: this.nombreInstitucion,
        rbd: this.rbd,
        encargado: this.encargado,
        correo: this.correo,
        telefono: this.telefono,
        cantidadEstudiantes: Number(this.cantidadEstudiantes),
      });

      await loading.dismiss();
      await this.mostrarToast('Solicitud enviada. Te avisaremos cuando sea revisada. 📩');

      this.router.navigate(['/tabs/institucion'], {
        replaceUrl: true,
        queryParams: { nueva: solicitudId },
      });
    } catch (err) {
      console.error(err);
      await loading.dismiss();
      await this.mostrarToast('No pudimos enviar la solicitud. Intenta nuevamente.');
    }
  }

  private async mostrarToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 2600 });
    await toast.present();
  }
}
