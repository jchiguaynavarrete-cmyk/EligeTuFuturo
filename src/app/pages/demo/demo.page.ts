import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';

import { DemoService, PasoDemo } from 'src/app/services/demo.service';

/**
 * Recorrido de demostración, público y sin registro.
 *
 * Son pantallas propias con datos ficticios, no la app real en otro modo:
 * así la demo no necesita saltarse el guard de sesión ni hacer que los
 * servicios devuelvan datos falsos, que es por donde se cuelan los errores
 * que terminan en producción.
 */
@Component({
  selector: 'app-demo',
  standalone: true,
  templateUrl: './demo.page.html',
  styleUrls: ['./demo.page.scss'],
  imports: [CommonModule, IonContent],
})
export class DemoPage {
  private demoService = inject(DemoService);
  private router = inject(Router);

  readonly perfil = this.demoService.perfil;
  readonly puntajes = this.demoService.puntajes;
  readonly carreras = this.demoService.carreras;
  readonly reporte = this.demoService.reporte;
  readonly pasos = this.demoService.pasos;

  indice = 0;

  get paso(): PasoDemo {
    return this.pasos[this.indice];
  }

  get esPrimero(): boolean {
    return this.indice === 0;
  }

  get esUltimo(): boolean {
    return this.indice === this.pasos.length - 1;
  }

  get progreso(): number {
    return Math.round(((this.indice + 1) / this.pasos.length) * 100);
  }

  siguiente(): void {
    if (!this.esUltimo) this.indice++;
  }

  anterior(): void {
    if (!this.esPrimero) this.indice--;
  }

  irA(i: number): void {
    if (i >= 0 && i < this.pasos.length) this.indice = i;
  }

  /** Salta el tour y va directo a pedir el piloto. */
  solicitarPiloto(): void {
    this.router.navigate(['/institucional/contacto'], {
      queryParams: { plan: 'piloto' },
    });
  }

  salir(): void {
    this.router.navigateByUrl('/institucional');
  }

  /** Puntaje ponderado de ejemplo, para que el simulador se vea real. */
  ponderado(c: { puntajeCorte: number }): number {
    const p = this.puntajes;
    return Math.round(
      p.nem * 0.15 + p.ranking * 0.2 + p.lectora * 0.2 + p.matematica * 0.35 + p.ciencias * 0.1
    );
  }

  alcanza(c: { puntajeCorte: number }): boolean {
    return this.ponderado(c) >= c.puntajeCorte;
  }
}
