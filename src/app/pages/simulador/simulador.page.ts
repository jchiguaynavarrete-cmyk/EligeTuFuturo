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

  aplicarFiltrosResultados() {
    this.filtradas = this.carrerasSimuladas
      .filter((cs) => {
        const c = cs.carrera;
        return (
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
   */
  private pruebasFaltantes(c: CarreraDoc): string[] {
    const pares: [string, number | null, any][] = [
      ['Ciencias', this.puntajes.ciencias, (c as any).psu_ciencias],
      ['Historia', this.puntajes.historia, (c as any).psu_historia],
      ['Ranking', this.puntajes.ranking, (c as any).ranking],
      ['NEM', this.puntajes.notasEm, (c as any).notas_em],
    ];
    return pares
      .filter(([, valor, peso]) => valor == null && this.pesoToPercent(peso) > 0)
      .map(([nombre]) => nombre);
  }

  // =========================
  // CÁLCULO (normaliza ponderaciones a 100%)
  // =========================
  private calcularPonderado(c: CarreraDoc): number {
    const wLeng = this.pesoToPercent((c as any).psu_lenguaje);
    const wMat  = this.pesoToPercent((c as any).psu_matematicas);
    const wCie  = this.pesoToPercent((c as any).psu_ciencias);
    const wHis  = this.pesoToPercent((c as any).psu_historia);
    const wRank = this.pesoToPercent((c as any).ranking);
    const wNem  = this.pesoToPercent((c as any).notas_em);

    const suma = wLeng + wMat + wCie + wHis + wRank + wNem;
    if (suma <= 0) return 0;

    const f = 100 / suma;

    let total = 0;
    if (this.puntajes.lenguaje != null)    total += this.puntajes.lenguaje    * ((wLeng * f) / 100);
    if (this.puntajes.matematicas != null) total += this.puntajes.matematicas * ((wMat  * f) / 100);
    if (this.puntajes.ciencias != null)    total += this.puntajes.ciencias    * ((wCie  * f) / 100);
    if (this.puntajes.historia != null)    total += this.puntajes.historia    * ((wHis  * f) / 100);
    if (this.puntajes.ranking != null)     total += this.puntajes.ranking     * ((wRank * f) / 100);
    if (this.puntajes.notasEm != null)     total += this.puntajes.notasEm     * ((wNem  * f) / 100);

    return total;
  }

  // =========================
  // TEXTO DE PONDERACIONES (bonito)
  // =========================
  private ponderacionesTexto(c: CarreraDoc): string {
    let wLeng = this.pesoToPercent((c as any).psu_lenguaje);
    let wMat  = this.pesoToPercent((c as any).psu_matematicas);
    let wCie  = this.pesoToPercent((c as any).psu_ciencias);
    let wHis  = this.pesoToPercent((c as any).psu_historia);
    let wRank = this.pesoToPercent((c as any).ranking);
    let wNem  = this.pesoToPercent((c as any).notas_em);

    const suma = wLeng + wMat + wCie + wHis + wRank + wNem;
    if (suma <= 0) return 'Sin ponderación disponible';

    const f = 100 / suma;
    wLeng *= f; wMat *= f; wCie *= f; wHis *= f; wRank *= f; wNem *= f;

    const parts: string[] = [];
    if (wLeng > 0) parts.push(`L ${Math.round(wLeng)}%`);
    if (wMat  > 0) parts.push(`M ${Math.round(wMat)}%`);
    if (wCie  > 0) parts.push(`C ${Math.round(wCie)}%`);
    if (wHis  > 0) parts.push(`H ${Math.round(wHis)}%`);
    if (wRank > 0) parts.push(`Rk ${Math.round(wRank)}%`);
    if (wNem  > 0) parts.push(`NEM ${Math.round(wNem)}%`);

    return parts.join(' · ');
  }
}
