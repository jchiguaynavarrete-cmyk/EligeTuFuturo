import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonSpinner } from '@ionic/angular/standalone';

import { firstValueFrom } from 'rxjs';

import { PlanesService } from 'src/app/services/planes.service';
import { ContactoService } from 'src/app/services/contacto.service';
import { Plan } from 'src/app/models/planes.model';

type Campo =
  | 'nombre'
  | 'cargo'
  | 'institucion'
  | 'correo'
  | 'telefono'
  | 'cantidadAlumnos';

/**
 * Formulario corto de contacto para instituciones.
 *
 * Es público, así que no escribe en la base directamente: lo envía al
 * backend, que valida y guarda con el Admin SDK. Abrir escritura anónima
 * en la base dejaría la puerta para llenar la base de basura.
 */
@Component({
  selector: 'app-contacto-institucional',
  standalone: true,
  templateUrl: './contacto-institucional.page.html',
  styleUrls: ['./contacto-institucional.page.scss'],
  imports: [CommonModule, FormsModule, IonContent, IonSpinner],
})
export class ContactoInstitucionalPage {
  private planesService = inject(PlanesService);
  private contactoService = inject(ContactoService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  plan: Plan | null = null;
  cargandoPlan = true;

  nombre = '';
  cargo = '';
  institucion = '';
  correo = '';
  telefono = '';
  cantidadAlumnos: number | null = null;

  enviando = false;
  enviado = false;
  errorEnvio = '';

  salido: Record<Campo, boolean> = {
    nombre: false,
    cargo: false,
    institucion: false,
    correo: false,
    telefono: false,
    cantidadAlumnos: false,
  };

  constructor() {
    this.cargarPlan();
  }

  private async cargarPlan(): Promise<void> {
    const id = this.route.snapshot.queryParamMap.get('plan');

    if (!id) {
      this.cargandoPlan = false;
      return;
    }

    try {
      this.plan = await firstValueFrom(this.planesService.getPlan(id as any));
    } catch (err) {
      // Sin plan el formulario sigue sirviendo como contacto general.
      console.error(err);
    } finally {
      this.cargandoPlan = false;
    }
  }

  marcarSalida(campo: Campo): void {
    this.salido[campo] = true;
  }

  alEscribir(campo: Campo): void {
    this.salido[campo] = false;
  }

  onTelefonoInput(event: any): void {
    const limpio = ((event?.detail?.value ?? event?.target?.value ?? '') as string)
      .replace(/[^\d+ ]/g, '')
      .slice(0, 16);

    this.telefono = limpio;
    this.alEscribir('telefono');
  }

  private validar(campo: Campo): string {
    switch (campo) {
      case 'nombre': {
        const v = this.nombre.trim();
        if (!v) return 'Ingresa tu nombre.';
        if (v.split(/\s+/).filter(Boolean).length < 2) return 'Escribe nombre y apellido.';
        return '';
      }
      case 'cargo': {
        const v = this.cargo.trim();
        if (!v) return 'Indica tu cargo.';
        if (v.length < 3) return 'El cargo es demasiado corto.';
        return '';
      }
      case 'institucion': {
        const v = this.institucion.trim();
        if (!v) return 'Indica la institución o comuna.';
        if (v.length < 3) return 'El nombre es demasiado corto.';
        return '';
      }
      case 'correo': {
        const v = this.correo.trim();
        if (!v) return 'Ingresa un correo de contacto.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'El correo no es válido.';
        return '';
      }
      case 'telefono': {
        const v = this.telefono.replace(/\D/g, '');
        if (!v) return '';
        if (v.length < 8) return 'El teléfono está incompleto.';
        return '';
      }
      case 'cantidadAlumnos': {
        const v = this.cantidadAlumnos;
        if (v === null || `${v}` === '') return 'Indica el número aproximado de alumnos.';
        if (!Number.isInteger(Number(v)) || Number(v) <= 0) return 'Debe ser mayor que cero.';
        if (Number(v) > 500000) return 'La cantidad parece demasiado alta.';
        return '';
      }
    }
  }

  errorDe(campo: Campo): string {
    return this.salido[campo] ? this.validar(campo) : '';
  }

  get formularioValido(): boolean {
    return (Object.keys(this.salido) as Campo[]).every((c) => !this.validar(c));
  }

  async enviar(): Promise<void> {
    (Object.keys(this.salido) as Campo[]).forEach((c) => (this.salido[c] = true));

    if (!this.formularioValido || this.enviando) return;

    this.enviando = true;
    this.errorEnvio = '';

    try {
      await this.contactoService.enviar({
        nombre: this.nombre.trim(),
        cargo: this.cargo.trim(),
        institucion: this.institucion.trim(),
        correo: this.correo.trim().toLowerCase(),
        telefono: this.telefono.trim(),
        cantidadAlumnos: Number(this.cantidadAlumnos),
        planId: this.plan?.id ?? null,
        planNombre: this.plan?.nombre ?? null,
      });

      this.enviado = true;
    } catch (err: any) {
      console.error(err);
      this.errorEnvio = this.contactoService.mensajeDeError(err?.message);
    } finally {
      this.enviando = false;
    }
  }

  volverALanding(): void {
    this.router.navigateByUrl('/institucional');
  }

  verDemo(): void {
    this.router.navigateByUrl('/demo');
  }
}
