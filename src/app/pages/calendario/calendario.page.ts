import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { AlertController, ToastController } from '@ionic/angular';
import {
  IonContent,
  IonHeader,
  IonToolbar,
} from '@ionic/angular/standalone';

import { FechasPaesService, FechaPaes } from 'src/app/services/fechas-paes.service';
import { UsuarioService } from 'src/app/services/usuario.service';
import { AuthService } from 'src/app/services/auth.service';

/** Una fecha, ya con todo lo que la pantalla necesita saber de ella. */
interface HitoPaes extends FechaPaes {
  cuando: Date;
  dias: number;
  estado: 'pasada' | 'hoy' | 'proxima' | 'futura';
}

const SALTO = String.fromCharCode(10);

@Component({
  selector: 'app-calendario',
  templateUrl: './calendario.page.html',
  styleUrls: ['./calendario.page.scss'],
  standalone: true,
  imports: [CommonModule, IonContent, IonHeader, IonToolbar],
})
export class CalendarioPage {
  private fechasService = inject(FechasPaesService);
  private usuarioService = inject(UsuarioService);
  private authService = inject(AuthService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  hitos: HitoPaes[] = [];
  cargando = true;
  error = '';
  esAdmin = false;

  ionViewWillEnter() {
    this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando = true;
    this.error = '';

    try {
      const [fechas, rol] = await Promise.all([
        this.fechasService.listar(),
        this.rolActual(),
      ]);

      this.esAdmin = rol === 'admin';
      this.hitos = this.prepararHitos(fechas);
    } catch (err) {
      console.error('No se pudieron cargar las fechas:', err);
      this.error = 'No pudimos cargar las fechas del proceso.';
      this.hitos = [];
    } finally {
      this.cargando = false;
    }
  }

  private async rolActual(): Promise<string | null> {
    const uid = this.authService.getUid();
    if (!uid) return null;

    try {
      const perfil = await firstValueFrom(this.usuarioService.getUsuario(uid));
      return perfil?.rol ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Calcula días restantes y estado de cada hito.
   *
   * Las fechas vienen como 'aaaa-mm-dd'. Construirlas con `new Date(texto)`
   * las interpreta en UTC y en Chile eso corre el día hacia atrás, así que
   * se arman leyendo los números por separado.
   */
  private prepararHitos(fechas: FechaPaes[]): HitoPaes[] {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const preparados: HitoPaes[] = fechas.map((f) => {
      const [a, m, d] = f.fecha.split('-').map(Number);
      const cuando = new Date(a, m - 1, d);

      const dias = Math.round((cuando.getTime() - hoy.getTime()) / 86400000);

      let estado: HitoPaes['estado'];
      if (dias < 0) estado = 'pasada';
      else if (dias === 0) estado = 'hoy';
      else estado = 'futura';

      return { ...f, cuando, dias, estado };
    });

    // La primera que todavía no ocurre es la que importa: se destaca.
    const siguiente = preparados.find((h) => h.dias > 0);
    if (siguiente) siguiente.estado = 'proxima';

    return preparados;
  }

  get hayPendientes(): boolean {
    return this.hitos.some((h) => h.dias >= 0);
  }

  /** La próxima, para el resumen de arriba. */
  get proxima(): HitoPaes | undefined {
    return this.hitos.find((h) => h.estado === 'proxima' || h.estado === 'hoy');
  }

  textoDias(h: HitoPaes): string {
    if (h.dias === 0) return 'Es hoy';
    if (h.dias === 1) return 'Falta 1 día';
    if (h.dias > 1) return `Faltan ${h.dias} días`;
    if (h.dias === -1) return 'Fue ayer';
    return `Hace ${Math.abs(h.dias)} días`;
  }

  /**
   * Descarga el hito como archivo de calendario.
   *
   * Antes el botón decía "Recibir aviso" y solo mostraba un cartel: no
   * enviaba nada ni quedaba registrado en ninguna parte. Un archivo .ics
   * lo agrega al calendario del teléfono o del computador de verdad, y
   * no necesita permisos ni servidor.
   */
  async agendar(h: HitoPaes): Promise<void> {
    try {
      const ics = this.construirIcs(h);
      const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `${this.aNombreArchivo(h.titulo)}.ics`;
      enlace.click();

      URL.revokeObjectURL(url);
      await this.avisar('Listo. Abre el archivo para agregarlo a tu calendario.');
    } catch (err) {
      console.error('No se pudo generar el archivo:', err);
      await this.avisar('No pudimos generar el archivo de calendario.');
    }
  }

  private construirIcs(h: HitoPaes): string {
    const dia = h.fecha.replace(/-/g, '');

    // Un evento de día completo termina al día siguiente, según el formato.
    const siguiente = new Date(h.cuando);
    siguiente.setDate(siguiente.getDate() + 1);
    const finDia =
      siguiente.getFullYear().toString() +
      String(siguiente.getMonth() + 1).padStart(2, '0') +
      String(siguiente.getDate()).padStart(2, '0');

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//EligeTuFuturo//Calendario PAES//ES',
      'BEGIN:VEVENT',
      `UID:paes-${h.id}@eligetufuturo`,
      `DTSTART;VALUE=DATE:${dia}`,
      `DTEND;VALUE=DATE:${finDia}`,
      `SUMMARY:${h.titulo}`,
      `DESCRIPTION:${h.descripcion ?? ''}`,
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      `DESCRIPTION:Mañana: ${h.titulo}`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join(SALTO);
  }

  private aNombreArchivo(titulo: string): string {
    return titulo
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  // ===================== Edición, solo administración =====================

  async editar(h: HitoPaes): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Editar fecha',
      subHeader: h.titulo,
      inputs: [
        { name: 'titulo', type: 'text', value: h.titulo, placeholder: 'Nombre del hito' },
        { name: 'fecha', type: 'date', value: h.fecha },
        {
          name: 'descripcion',
          type: 'textarea',
          value: h.descripcion ?? '',
          placeholder: 'Una línea explicando de qué se trata',
        },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Guardar', role: 'guardar' },
      ],
    });

    await alert.present();

    // El trabajo va después del cierre: abrir un cartel encima de un
    // diálogo que aún se cierra deja la espera colgada para siempre.
    const { role, data } = await alert.onDidDismiss();
    if (role !== 'guardar') return;

    const titulo = (data?.values?.titulo ?? '').trim();
    const fecha = (data?.values?.fecha ?? '').slice(0, 10);

    if (!titulo || !fecha) {
      await this.avisar('El nombre y la fecha son obligatorios.');
      return;
    }

    try {
      await this.fechasService.actualizar(h.id, {
        titulo,
        fecha,
        descripcion: (data?.values?.descripcion ?? '').trim() || null,
      });

      await this.cargar();
      await this.avisar('Fecha actualizada.');
    } catch (err: any) {
      console.error(err);
      await this.avisar(err?.message || 'No se pudo guardar la fecha.');
    }
  }

  private async avisar(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 3000 });
    await toast.present();
  }
}
