import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonAccordionGroup,
  IonAccordion,
  IonItem,
  IonLabel,
} from '@ionic/angular/standalone';

import { CarreraDoc } from '../../services/carreras.service';
import { FavoritosService } from '../../services/favoritos.service';

@Component({
  selector: 'app-favoritos',
  templateUrl: './favoritos.page.html',
  styleUrls: ['./favoritos.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonHeader,
    IonToolbar,
    IonAccordionGroup,
    IonAccordion,
    IonItem,
    IonLabel,
  ],
})
export class FavoritosPage implements OnInit {
  private favoritosService = inject(FavoritosService);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);

  favoritas: CarreraDoc[] = [];
  cargando = true;

  ngOnInit() {
    this.cargarFavoritos();
  }

  /** Al volver a la pestaña puede haber favoritos nuevos marcados en Carreras. */
  ionViewWillEnter() {
    this.cargarFavoritos();
  }

  /**
   * Trae las carreras guardadas en una sola consulta.
   *
   * Antes se bajaba el catálogo entero y se cruzaba en el navegador: tres
   * mil carreras descargadas para mostrar cinco. La consulta con join ya
   * existía en el servicio, pero esta pantalla no la usaba.
   */
  cargarFavoritos() {
    this.cargando = true;

    this.favoritosService.getFavoritos().subscribe({
      next: (carreras) => {
        this.favoritas = carreras;
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('No se pudieron cargar los favoritos:', err);
        this.favoritas = [];
        this.cargando = false;
        this.cdr.detectChanges();
      },
    });
  }

  irACarreras() {
    this.router.navigateByUrl('/tabs/carreras');
  }

  /** El ancho de la barra de ponderación, de 0 a 100. */
  pesoNum(x: any): number {
    if (x === null || x === undefined) return 0;

    const s = String(x).trim();
    if (!s || s === '-' || s.toLowerCase() === 's/i') return 0;

    const n = Number(s.replace(',', '.'));
    if (Number.isNaN(n)) return 0;

    // Vienen como 0.20 o como 20 según la fila; se normalizan a 0-100.
    const pct = n <= 1 ? n * 100 : n;
    return Math.max(0, Math.min(100, Math.round(pct)));
  }

  esTecnica(c: any): boolean {
    return String(c.es_tecnico) === '1';
  }

  async quitarFavorito(carrera: CarreraDoc, ev: Event) {
    ev.stopPropagation();
    await this.favoritosService.toggleFavorito(carrera);
    this.cargarFavoritos();
  }

  // ======================
  // HELPERS (ROBUSTOS)
  // ======================
  v(x: any): string {
    if (x === null || x === undefined) return '—';
    const s = String(x).trim();
    return s.length ? s : '—';
  }

  // número bonito para strings numéricas
  num(x: any): string {
    if (x === null || x === undefined) return '—';
    const raw = String(x).trim();
    if (!raw.length) return '—';
    const n = Number(raw.replace(/\./g, '').replace(',', '.'));
    if (Number.isNaN(n)) return raw; // si viene "s/i" o "-" lo dejamos tal cual
    return n.toLocaleString('es-CL');
  }

  // ✅ 0.200 -> "20%" | "-" o "s/i" -> "—"
  pPeso(x: any): string {
    if (x === null || x === undefined) return '—';
    const s = String(x).trim();
    if (!s || s === '-' || s.toLowerCase() === 's/i') return '—';

    const n = Number(s.replace(',', '.'));
    if (Number.isNaN(n)) return '—';

    return `${Math.round(n * 100)}%`;
  }

  // ✅ ponderaciones en %
  pNemPct(c: any) {
    return this.pPeso(c.notas_em ?? c.nem);
  }
  pRankingPct(c: any) {
    return this.pPeso(c.ranking);
  }
  pLenguajePct(c: any) {
    return this.pPeso(c.psu_lenguaje ?? c.lenguaje);
  }
  pMatematicasPct(c: any) {
    return this.pPeso(c.psu_matematicas ?? c.matematicas ?? c.matematicas1);
  }
  pCienciasPct(c: any) {
    return this.pPeso(c.psu_ciencias ?? c.ciencias);
  }
  pHistoriaPct(c: any) {
    return this.pPeso(c.psu_historia ?? c.historia);
  }

  // ======================
  // IMPRIMIR
  // ======================
  imprimirFavoritos() {
    const ventana = window.open('', '_blank', 'width=900,height=650');

    ventana?.document.write(`
      <html>
        <head><title>Informe de Favoritos</title></head>
        <body style="font-family: Arial; padding: 20px;">
          <h1>Informe de Carreras Favoritas</h1>
          ${this.favoritas
            .map(
              (c: any) => `
              <h3>${c.carrera}</h3>
              <p>${c.nombre_institucion} - ${c.region_sede}</p>
              <p><b>Arancel:</b> ${this.v(c.valor_arancel)} | <b>Duración:</b> ${this.v(c.duracion_formal)} sem | <b>Vacantes:</b> ${this.v(c.vacantes_primer_semestre)}</p>
              <p><b>Ponderaciones:</b> NEM ${this.pNemPct(c)} · Ranking ${this.pRankingPct(c)} · Lenguaje ${this.pLenguajePct(c)} · Mate ${this.pMatematicasPct(c)} · Ciencias ${this.pCienciasPct(c)} · Historia ${this.pHistoriaPct(c)}</p>
              <hr/>
            `
            )
            .join('')}
        </body>
      </html>
    `);

    ventana?.document.close();
    ventana?.print();
  }
}
