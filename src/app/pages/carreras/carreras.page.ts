import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonItem,
  IonLabel,
  IonAccordionGroup,
  IonAccordion,
  IonSelect,
  IonSelectOption,
  IonSearchbar,
  IonButton,
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
    IonToolbar,
    IonItem,
    IonLabel,
    IonAccordionGroup,
    IonAccordion,
    IonSelect,
    IonSelectOption,
    IonSearchbar,
    IonButton,
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

  /** Total de carreras que cumplen los filtros, según la base. */
  total = 0;
  cargando = false;

  ngOnInit() {
    this.cargarOpciones();
    this.aplicarFiltros();
    this.cargarFavoritos();
  }

  /**
   * Al volver a esta pestaña se vuelven a pedir los favoritos.
   *
   * Ionic mantiene las pestañas montadas, así que sin esto la pantalla se
   * quedaba con la lista del momento en que se abrió: quitar un favorito
   * desde la otra pestaña no despintaba el corazón aquí.
   */
  ionViewWillEnter() {
    this.cargarFavoritos();
  }

  private async cargarFavoritos(): Promise<void> {
    try {
      // `firstValueFrom` cierra la suscripción al primer valor. Suscribirse
      // sin cerrar dejaba una abierta por cada entrada a la pestaña.
      this.favoritosIds = await firstValueFrom(
        this.favoritosService.getFavoritosIds()
      );
    } catch (err) {
      console.error('Error cargando favoritos:', err);
    }
  }

  /**
   * Valores de los selectores de filtro.
   *
   * Se piden aparte, una sola vez: antes se deducían del catálogo
   * completo, que es justamente lo que dejamos de traer.
   */
  private async cargarOpciones(): Promise<void> {
    try {
      const [areas, regiones, instituciones, horarios] = await Promise.all([
        this.carrerasService.getOpcionesFiltro('area_cineunesco'),
        this.carrerasService.getOpcionesFiltro('region_sede'),
        this.carrerasService.getOpcionesFiltro('nombre_institucion'),
        this.carrerasService.getOpcionesFiltro('horario'),
      ]);

      this.areas = ['TODAS', ...areas];
      this.regiones = ['TODAS', ...regiones];
      this.instituciones = ['TODAS', ...instituciones];
      this.horarios = ['TODOS', ...horarios];

      this.totalCatalogo = await this.carrerasService.contarCarreras();
    } catch (err) {
      console.error('Error cargando filtros:', err);
    }
  }

  irAlSimulador() {
    this.router.navigateByUrl('/tabs/simulador');
  }

  /**
   * Pide a la base la página actual ya filtrada y ordenada.
   *
   * Antes se traía el catálogo completo y se filtraba en el navegador.
   * Ahora viajan 20 filas por consulta en vez de 3.000, y el filtro y el
   * orden los resuelve PostgreSQL con sus índices.
   */
  async aplicarFiltros(reiniciarPagina = true): Promise<void> {
    if (reiniciarPagina) this.pagina = 1;

    this.cargando = true;

    try {
      const { items, total } = await this.carrerasService.getCarrerasPagina({
        vista: 'activas',
        busqueda: this.searchTerm,
        area: this.filtroArea,
        region: this.filtroRegion,
        institucion: this.filtroInstitucion,
        horario: this.filtroHorario,
        orden: this.orden,
        pagina: this.pagina - 1,
        tamano: this.porPagina,
      });

      this.carreras = items;
      this.filtradas = items;
      this.total = total;
    } catch (err) {
      console.error('Error cargando carreras:', err);
      this.carreras = [];
      this.filtradas = [];
      this.total = 0;
    } finally {
      this.cargando = false;
    }
  }

  ordenar() {
    this.aplicarFiltros();
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
    return Math.max(1, Math.ceil(this.total / this.porPagina));
  }

  /** Lo que llega de la base ya es la página; no hay que recortar nada. */
  get paginaActualCarreras(): CarreraDoc[] {
    return this.carreras;
  }

  paginaAnterior() {
    if (this.pagina > 1) {
      this.pagina--;
      this.aplicarFiltros(false);
    }
  }

  paginaSiguiente() {
    if (this.pagina < this.totalPaginas) {
      this.pagina++;
      this.aplicarFiltros(false);
    }
  }

  esFavorito(carrera: CarreraDoc): boolean {
    return this.favoritosIds.has(carrera.id);
  }

  async toggleFavorito(carrera: CarreraDoc, ev: Event) {
    ev.stopPropagation();

    /*
     * El corazón se pinta con lo que devuelve la base, no antes.
     *
     * Pintar primero y corregir después se vería más rápido, pero si la
     * operación falla el corazón se devolvería solo y nadie entendería
     * por qué. Son décimas de segundo: no vale el engaño.
     */
    try {
      const esFavorita = await this.favoritosService.toggleFavorito(carrera);
      const id = String(carrera.id);

      if (esFavorita) {
        this.favoritosIds.add(id);
      } else {
        this.favoritosIds.delete(id);
      }
    } catch (err) {
      console.error('No se pudo cambiar el favorito:', err);
    }
  }

  /** Carreras del catálogo completo. Se cuenta una vez, sin traer filas. */
  totalCatalogo = 0;

  get totalCarreras(): number {
    return this.totalCatalogo;
  }

  /** Cuántas cumplen los filtros actuales, no cuántas se están mostrando. */
  get totalFiltradas(): number {
    return this.total;
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
