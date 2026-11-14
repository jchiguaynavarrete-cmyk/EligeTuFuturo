import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonList,
  IonItem,
  IonLabel,
  IonAccordionGroup,
  IonAccordion,
  IonSelect,
  IonSelectOption,
  IonSearchbar,
  IonButton,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
} from '@ionic/angular/standalone';

import { CarrerasService, CarreraDoc } from '../../services/carreras.service';
import { FavoritosService } from '../../services/favoritos.service';

@Component({
  selector: 'app-carreras',
  templateUrl: './carreras.page.html',
  styleUrls: ['./carreras.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonList,
    IonItem,
    IonLabel,
    IonAccordionGroup,
    IonAccordion,
    IonSelect,
    IonSelectOption,
    IonSearchbar,
    IonButton,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
  ],
})
export class CarrerasPage implements OnInit {
  private carrerasService = inject(CarrerasService);
  private favoritosService = inject(FavoritosService);
  private router = inject(Router);

  carreras: CarreraDoc[] = [];
  filtradas: CarreraDoc[] = [];

  pagina = 1;
  porPagina = 20;

  filtroArea = 'TODAS';
  filtroRegion = 'TODAS';
  filtroInstitucion = 'TODAS';
  filtroHorario = 'TODOS';
  searchTerm = '';

  orden: 'nombre' | 'arancel' | 'duracion' = 'nombre';

  areas: string[] = ['TODAS'];
  regiones: string[] = ['TODAS'];
  instituciones: string[] = ['TODAS'];
  horarios: string[] = ['TODOS'];

  favoritosIds: Set<string> = new Set<string>();

  ngOnInit() {
    this.carrerasService.getCarreras().subscribe({
      next: (data) => {
        this.carreras = (data ?? []).filter((c) => c.activa !== false);

        this.areas = this.buildOptions(this.carreras.map((c) => c.area_cineunesco), 'TODAS');
        this.regiones = this.buildOptions(this.carreras.map((c) => c.region_sede), 'TODAS');
        this.instituciones = this.buildOptions(this.carreras.map((c) => c.nombre_institucion), 'TODAS');
        this.horarios = this.buildOptions(this.carreras.map((c) => c.horario), 'TODOS');

        this.aplicarFiltros();
      },
      error: (err) => console.error('❌ Firestore carreras error:', err),
    });

    this.favoritosService.getFavoritosIds().subscribe({
      next: (ids) => (this.favoritosIds = ids),
      error: (err) => console.error('❌ Firestore favoritos error:', err),
    });
  }

  irAlSimulador() {
    this.router.navigateByUrl('/tabs/simulador');
  }

  aplicarFiltros() {
    const term = (this.searchTerm || '').toLowerCase().trim();

    this.filtradas = this.carreras.filter((c) => {
      const coincideArea = this.filtroArea === 'TODAS' || c.area_cineunesco === this.filtroArea;
      const coincideRegion = this.filtroRegion === 'TODAS' || c.region_sede === this.filtroRegion;
      const coincideInstitucion =
        this.filtroInstitucion === 'TODAS' || c.nombre_institucion === this.filtroInstitucion;
      const coincideHorario = this.filtroHorario === 'TODOS' || c.horario === this.filtroHorario;

      const coincideTexto =
        !term ||
        (c.carrera || '').toLowerCase().includes(term) ||
        (c.nombre_institucion || '').toLowerCase().includes(term) ||
        (c.region_sede || '').toLowerCase().includes(term) ||
        (c.sede || '').toLowerCase().includes(term);

      return coincideArea && coincideRegion && coincideInstitucion && coincideHorario && coincideTexto;
    });

    this.ordenar();
    this.pagina = 1;
  }

  ordenar() {
    this.filtradas.sort((a, b) => {
      switch (this.orden) {
        case 'arancel':
          return this.parseArancel(a.valor_arancel) - this.parseArancel(b.valor_arancel);
        case 'duracion':
          return this.parseIntSafe(a.duracion_formal) - this.parseIntSafe(b.duracion_formal);
        case 'nombre':
        default:
          return (a.carrera || '').localeCompare(b.carrera || '');
      }
    });
  }

  limpiarFiltros() {
    this.filtroArea = 'TODAS';
    this.filtroRegion = 'TODAS';
    this.filtroInstitucion = 'TODAS';
    this.filtroHorario = 'TODOS';
    this.searchTerm = '';
    this.orden = 'nombre';
    this.aplicarFiltros();
  }

  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.filtradas.length / this.porPagina));
  }

  get paginaActualCarreras(): CarreraDoc[] {
    const inicio = (this.pagina - 1) * this.porPagina;
    return this.filtradas.slice(inicio, inicio + this.porPagina);
  }

  paginaAnterior() {
    if (this.pagina > 1) this.pagina--;
  }

  paginaSiguiente() {
    if (this.pagina < this.totalPaginas) this.pagina++;
  }

  esFavorito(carrera: CarreraDoc): boolean {
    return this.favoritosIds.has(carrera.id);
  }

  async toggleFavorito(carrera: CarreraDoc, ev: Event) {
    ev.stopPropagation();
    await this.favoritosService.toggleFavorito(carrera);
  }

  get totalCarreras(): number {
    return this.carreras.length;
  }

  get totalFiltradas(): number {
    return this.filtradas.length;
  }

  private parseArancel(valor: string): number {
    if (!valor) return 0;
    return Number(String(valor).replace(/[^0-9]/g, '')) || 0;
  }

  private parseIntSafe(valor: string): number {
    return parseInt(String(valor || '0'), 10) || 0;
  }

  private buildOptions(values: (string | undefined | null)[], first: string): string[] {
    const clean = values
      .map((v) => (v ?? '').trim())
      .filter((v) => v.length > 0);

    const uniq = Array.from(new Set(clean)).sort((a, b) => a.localeCompare(b));
    return [first, ...uniq];
  }

  /** 0.100 => 10% | 0,100 => 10% | "10" => 10% */
  pct(valor: any): string {
    if (valor === null || valor === undefined) return '-';

    const raw = String(valor).trim();

    // normaliza: coma decimal, elimina %
    const normalized = raw.replace('%', '').replace(',', '.');

    // extrae el primer número posible
    const n = parseFloat(normalized);
    if (!isFinite(n)) return '-';

    const percent = (n >= 0 && n <= 1) ? n * 100 : n;

    // 1 decimal, pero sin .0
    const out = percent.toFixed(1).replace('.0', '');
    return `${out}%`;
  }
  pctNum(valor: any): number {
  if (valor === null || valor === undefined) return 0;

  const raw = String(valor).trim();
  const normalized = raw.replace('%', '').replace(',', '.');
  const n = parseFloat(normalized);

  if (!isFinite(n)) return 0;

  const percent = (n >= 0 && n <= 1) ? n * 100 : n;
  return Math.max(0, Math.min(100, percent));
}
}
