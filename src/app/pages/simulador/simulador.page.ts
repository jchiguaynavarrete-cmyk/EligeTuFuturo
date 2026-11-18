import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonItem,
  IonLabel,
  IonInput,
  IonButton,
  IonSelect,
  IonSelectOption,
  IonSearchbar,
  IonAccordion,
  IonAccordionGroup,
} from '@ionic/angular/standalone';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { CarrerasService, CarreraDoc } from '../../services/carreras.service';
import { AuthService } from 'src/app/services/auth.service';
import { UsuarioService } from 'src/app/services/usuario.service';
import { AvisoSinConvenioComponent } from 'src/app/components/aviso-sin-convenio/aviso-sin-convenio.component';
import { FavoritosService } from '../../services/favoritos.service';

import { addIcons } from 'ionicons';
import { star, starOutline } from 'ionicons/icons';
addIcons({ star, starOutline });

interface PuntajesUsuario {
  lenguaje: number | null;
  matematicas: number | null;
  ciencias: number | null;
  historia: number | null;
  ranking: number | null;
  notasEm: number | null;
}

type PuntajeKey = keyof PuntajesUsuario;

interface DetalleCalculoLinea {
  texto: string;
}

interface CarreraSimulada {
  carrera: CarreraDoc;
  puntajePonderado: number;
  ponderacionesTexto: string;
  nivelTexto: 'Técnica' | 'Profesional';
  detalleCalculo: DetalleCalculoLinea[];
  /** Pruebas que la carrera pondera pero el estudiante dejó en blanco. */
  pruebasFaltantes: string[];
}

@Component({
  selector: 'app-simulador',
  standalone: true,
  templateUrl: './simulador.page.html',
  styleUrls: ['./simulador.page.scss'],
  imports: [
    CommonModule,
    AvisoSinConvenioComponent,
    FormsModule,
    IonContent,
    IonHeader,
    IonToolbar,
    IonItem,
    IonLabel,
    IonInput,
    IonButton,
    IonSelect,
    IonSelectOption,
    IonSearchbar,
    IonAccordion,
    IonAccordionGroup,
  ],
})
export class SimuladorPage implements OnInit {
  private authService = inject(AuthService);
  private usuarioService = inject(UsuarioService);
  private carrerasService = inject(CarrerasService);
  private favoritosService = inject(FavoritosService);
  private router = inject(Router);

  /**
   * El simulador requiere que el establecimiento tenga convenio activo.
   * Mientras se resuelve queda en null para no mostrar el aviso en falso.
   */
  tieneConvenio: boolean | null = null;


  readonly PAES_MIN = 100;
  readonly PAES_MAX = 1000;

  cargando = false;
  error?: string;

  todasLasCarreras: CarreraDoc[] = [];
  carrerasSimuladas: CarreraSimulada[] = [];
  filtradas: CarreraSimulada[] = [];

  // filtros
  filtroNivel: 'TODAS' | 'Profesional' | 'Técnica' = 'TODAS';
  filtroArea = 'TODAS';
  filtroRegion = 'TODAS';
  filtroInstitucion = 'TODAS';
  searchTerm = '';

  niveles = ['TODAS', 'Profesional', 'Técnica'];
  areas: string[] = ['TODAS'];
  regiones: string[] = ['TODAS'];
  instituciones: string[] = ['TODAS'];

  // favoritos
  favoritosIds = new Set<string>();
  private toggling = new Set<string>();

  puntajes: PuntajesUsuario = {
    lenguaje: null,
    matematicas: null,
    ciencias: null,
    historia: null,
    ranking: null,
    notasEm: null,
  };

  mensajesRango: Partial<Record<PuntajeKey, string>> = {};

  ngOnInit() {
    this.cargando = true;

    // Convenio del establecimiento: decide si el simulador se muestra.
    this.authService.user$.subscribe((user) => {
      if (!user?.id) {
        this.tieneConvenio = false;
        return;
      }

      this.usuarioService
        .tieneAccesoConConvenio(user.id)
        .subscribe((puede) => (this.tieneConvenio = puede));
    });

    this.carrerasService.getCarreras().subscribe((carreras) => {
      this.todasLasCarreras = carreras ?? [];
      this.armarOpcionesFiltros();
      this.cargando = false;
    });

    this.cargarFavoritos();
  }

  /** Al volver, puede haber favoritos marcados o quitados en otra pestaña. */
  ionViewWillEnter() {
    this.cargarFavoritos();
  }

  private async cargarFavoritos(): Promise<void> {
    try {
      this.favoritosIds = await firstValueFrom(
        this.favoritosService.getFavoritosIds()
      );
    } catch (err) {
      console.error('Error cargando favoritos:', err);
    }
  }

  // =========================
  // 🔑 HELPER PARA EL TEMPLATE
  // =========================
  getCampo(c: CarreraDoc, key: string): any {
    return (c as any)?.[key];
  }

  // =========================
  // ✅ PONDERACIÓN: DECIMAL -> %
  // =========================
  private pesoToPercent(raw: any): number {
    if (raw == null) return 0;

    if (typeof raw === 'number') {
      if (!isFinite(raw)) return 0;
      return raw <= 1 ? raw * 100 : raw; // 0.5 -> 50
    }

    const s = String(raw).trim();
    if (!s) return 0;

    const cleaned = s.replace(/[^\d.,-]/g, '').replace(',', '.');
    const n = Number(cleaned);
    if (!isFinite(n)) return 0;

    return n <= 1 ? n * 100 : n;
  }

  // =========================
  // INPUTS
  // =========================
  onInputPuntaje(key: PuntajeKey) {
    const v = this.puntajes[key];
    if (v == null) return;

    if (v < this.PAES_MIN) this.mensajesRango[key] = `Mínimo ${this.PAES_MIN}`;
    else if (v > this.PAES_MAX) this.mensajesRango[key] = `Máximo ${this.PAES_MAX}`;
    else this.mensajesRango[key] = '';
  }

  normalizarPuntaje(key: PuntajeKey) {
    let v = this.puntajes[key];
    if (v == null) return;

    if (v < this.PAES_MIN) v = this.PAES_MIN;
    if (v > this.PAES_MAX) v = this.PAES_MAX;

    this.puntajes[key] = Math.round(v);
    this.mensajesRango[key] = '';
  }

  // =========================
  // SIMULACIÓN
  // =========================
  simular() {
    this.error = undefined;

    if (this.puntajes.lenguaje == null || this.puntajes.matematicas == null) {
      this.error = 'Debes ingresar Lenguaje y Matemáticas.';
      return;
    }

    const resultados: CarreraSimulada[] = [];

    for (const c of this.todasLasCarreras) {
      const puntaje = this.calcularPonderado(c);
      if (!puntaje) continue;

      resultados.push({
        carrera: c,
        puntajePonderado: Math.round(puntaje),
        nivelTexto: String((c as any).es_tecnico) === '1' ? 'Técnica' : 'Profesional',
        ponderacionesTexto: this.ponderacionesTexto(c),
        detalleCalculo: [],
        pruebasFaltantes: this.pruebasFaltantes(c),
      });
    }

    this.carrerasSimuladas = resultados.sort((a, b) => b.puntajePonderado - a.puntajePonderado);
    this.aplicarFiltrosResultados();
  }

  limpiar() {
    this.puntajes = {
      lenguaje: null,
      matematicas: null,
      ciencias: null,
      historia: null,
      ranking: null,
      notasEm: null,
    };
    this.carrerasSimuladas = [];
    this.filtradas = [];
  }

  volverACarreras() {
    this.router.navigate(['/tabs/carreras']);
  }

  // =========================
  // FILTROS
  // =========================
  onCambioFiltro() {
    this.aplicarFiltrosResultados();
  }

  onBuscar(termino: string | null | undefined) {
    this.searchTerm = termino ?? '';
    this.aplicarFiltrosResultados();
  }

  /**
   * Las opciones salen de las carreras que el simulador puede calcular (las
   * que traen ponderaciones). Con el catálogo completo habría opciones que
   * siempre dejan la lista vacía.
   */
  private armarOpcionesFiltros(): void {
    const calculables = this.todasLasCarreras.filter((c) => this.pesos(c).suma > 0);

    const opciones = (leer: (c: CarreraDoc) => unknown): string[] => [
      'TODAS',
      ...Array.from(
        new Set(calculables.map((c) => String(leer(c) ?? '').trim()).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b, 'es')),
    ];

    this.areas = opciones((c) => c.area_cineunesco);
    this.regiones = opciones((c) => c.region_sede);
    this.instituciones = opciones((c) => c.nombre_institucion);
  }

  /** Minúsculas y sin tildes: "ingenieria" encuentra "INGENIERÍA". */
  private normalizar(texto: unknown): string {
    return String(texto ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
  }

  aplicarFiltrosResultados() {
    const termino = this.normalizar(this.searchTerm);

    this.filtradas = this.carrerasSimuladas
      .filter((cs) => {
        const c = cs.carrera;
        const calzaTexto =
          !termino ||
          this.normalizar(
            `${c.carrera} ${c.nombre_institucion} ${c.sede ?? ''} ${c.region_sede ?? ''}`
          ).includes(termino);

        return (
          calzaTexto &&
          (this.filtroNivel === 'TODAS' || cs.nivelTexto === this.filtroNivel) &&
          (this.filtroArea === 'TODAS' || c.area_cineunesco === this.filtroArea) &&
          (this.filtroRegion === 'TODAS' || c.region_sede === this.filtroRegion) &&
          (this.filtroInstitucion === 'TODAS' || c.nombre_institucion === this.filtroInstitucion)
        );
      })
      .slice(0, 200);
  }

  trackById(_: number, cs: CarreraSimulada) {
    return cs.carrera.id;
  }

  esFavorito(c: CarreraDoc) {
    return this.favoritosIds.has(c.id);
  }

  estaToggling(c: CarreraDoc) {
    return this.toggling.has(c.id);
  }

  async toggleFavorito(c: CarreraDoc, ev: Event) {
    ev.stopPropagation();

    const id = String(c.id);
    if (this.toggling.has(id)) return;

    /*
     * `toggling` ya existía y la plantilla lo consultaba, pero nunca se
     * llenaba: el botón jamás se bloqueaba y dos clics seguidos podían
     * marcar y desmarcar en desorden.
     */
    this.toggling.add(id);

    try {
      const esFavorita = await this.favoritosService.toggleFavorito(c);

      // El corazón se pinta con lo que devuelve la base, no antes.
      if (esFavorita) {
        this.favoritosIds.add(id);
      } else {
        this.favoritosIds.delete(id);
      }
    } catch (err) {
      console.error('No se pudo cambiar el favorito:', err);
    } finally {
      this.toggling.delete(id);
    }
  }

  // =========================
  // PRUEBAS PONDERADAS SIN PUNTAJE
  // =========================
  /**
   * Una prueba en blanco aporta cero al ponderado. Si la carrera la
   * pondera, el resultado queda más bajo de lo real: se avisa en la
   * tarjeta para que el estudiante no lo tome como su puntaje definitivo.
   *
   * Sigue las mismas reglas que calcularPonderado: si la carrera acepta
   * Ciencias o Historia, basta con una de las dos; y el Ranking en blanco
   * se completa con el NEM, así que solo falta si tampoco hay NEM.
   */
  private pruebasFaltantes(c: CarreraDoc): string[] {
    const w = this.pesos(c);
    const p = this.puntajes;
    const faltan: string[] = [];

    if (w.electivaLibre) {
      if (p.ciencias == null && p.historia == null) faltan.push('Ciencias o Historia');
    } else {
      if (w.cie > 0 && p.ciencias == null) faltan.push('Ciencias');
      if (w.his > 0 && p.historia == null) faltan.push('Historia');
    }
    if (w.rank > 0 && p.ranking == null && p.notasEm == null) faltan.push('Ranking');
    if (w.nem > 0 && p.notasEm == null) faltan.push('NEM');

    return faltan;
  }

  // =========================
  // CÁLCULO (normaliza ponderaciones a 100%)
  // =========================

  /**
   * Ciencias e Historia son la prueba electiva de la PAES: el postulante usa
   * la mejor de las dos. Las carreras que aceptan cualquiera traen el mismo
   * peso en ambas columnas (las 432 del catálogo que traen las dos lo
   * cumplen, y contándolo una vez suman 100%), así que ese peso va una sola
   * vez. Contarlo doble inflaba la suma y castigaba a quien rindió solo una.
   */
  private pesos(c: CarreraDoc) {
    const leng = this.pesoToPercent((c as any).psu_lenguaje);
    const mat  = this.pesoToPercent((c as any).psu_matematicas);
    const cie  = this.pesoToPercent((c as any).psu_ciencias);
    const his  = this.pesoToPercent((c as any).psu_historia);
    const rank = this.pesoToPercent((c as any).ranking);
    const nem  = this.pesoToPercent((c as any).notas_em);

    const electivaLibre = cie > 0 && his > 0;
    const electiva = electivaLibre ? Math.max(cie, his) : 0;
    const suma = leng + mat + (electivaLibre ? electiva : cie + his) + rank + nem;

    return { leng, mat, cie, his, rank, nem, electivaLibre, electiva, suma };
  }

  private calcularPonderado(c: CarreraDoc): number {
    const w = this.pesos(c);
    if (w.suma <= 0) return 0;

    const f = 100 / w.suma;
    const p = this.puntajes;
    let total = 0;

    const sumar = (puntaje: number | null, peso: number) => {
      if (puntaje != null && peso > 0) total += puntaje * ((peso * f) / 100);
    };

    sumar(p.lenguaje, w.leng);
    sumar(p.matematicas, w.mat);

    if (w.electivaLibre) {
      const rendidas = [p.ciencias, p.historia].filter((v): v is number => v != null);
      sumar(rendidas.length ? Math.max(...rendidas) : null, w.electiva);
    } else {
      sumar(p.ciencias, w.cie);
      sumar(p.historia, w.his);
    }

    // Sin Ranking se usa el NEM: el Ranking nunca es menor que el NEM, así
    // que es la estimación prudente. Contarlo como 0 hundía a las carreras
    // que lo ponderan (entre 20% y 40%).
    sumar(p.ranking ?? p.notasEm, w.rank);
    sumar(p.notasEm, w.nem);

    return total;
  }

  // =========================
  // TEXTO DE PONDERACIONES (bonito)
  // =========================
  private ponderacionesTexto(c: CarreraDoc): string {
    const w = this.pesos(c);
    if (w.suma <= 0) return 'Sin ponderación disponible';

    const f = 100 / w.suma;
    const parts: string[] = [];
    const poner = (etiqueta: string, peso: number) => {
      if (peso > 0) parts.push(`${etiqueta} ${Math.round(peso * f)}%`);
    };

    poner('L', w.leng);
    poner('M', w.mat);
    if (w.electivaLibre) {
      poner('C o H', w.electiva);
    } else {
      poner('C', w.cie);
      poner('H', w.his);
    }
    poner('Rk', w.rank);
    poner('NEM', w.nem);

    return parts.join(' · ');
  }
}
