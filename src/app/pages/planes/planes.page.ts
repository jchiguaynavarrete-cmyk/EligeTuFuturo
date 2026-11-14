import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

import { Observable, of } from 'rxjs';
import { catchError, map, startWith } from 'rxjs/operators';

import { PlanesService } from 'src/app/services/planes.service';
import { CategoriaPlan, Plan } from 'src/app/models/planes.model';

/** Plan con los textos ya calculados para la tarjeta. */
type TarjetaPlan = {
  plan: Plan;
  precio: string;
  /** "$1.100.000 c/u", o vacío si el plan no tiene precio por establecimiento. */
  porEstablecimiento: string;
  /** Ahorro por establecimiento frente al plan base; 0 si no aplica. */
  ahorro: number;
};

type EstadoVitrina = {
  cargando: boolean;
  error: string;
  pagados: TarjetaPlan[];
  complementarios: TarjetaPlan[];
};

const VACIO: Omit<EstadoVitrina, 'cargando' | 'error'> = { pagados: [], complementarios: [] };

@Component({
  selector: 'app-planes',
  standalone: true,
  templateUrl: './planes.page.html',
  styleUrls: ['./planes.page.scss'],
  imports: [
    CommonModule,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonSpinner,
  ],
})
export class PlanesPage {
  private planesService = inject(PlanesService);
  private router = inject(Router);

  estado$: Observable<EstadoVitrina>;

  constructor() {
    this.estado$ = this.planesService.listarPlanesActivos().pipe(
      map((planes) => ({ cargando: false, error: '', ...this.armarVitrina(planes) })),
      catchError((err) => {
        console.error(err);
        return of({
          cargando: false,
          error: 'No pudimos cargar los planes. Intenta nuevamente más tarde.',
          ...VACIO,
        });
      }),
      startWith({ cargando: true, error: '', ...VACIO })
    );
  }

  solicitar(plan: Plan): void {
    this.router.navigate(['/tabs/planes/solicitud', plan.id]);
  }

  trackPorId(_: number, t: TarjetaPlan): string {
    return t.plan.id;
  }

  /** Separa planes pagados y complementarios, y calcula el ahorro por volumen. */
  private armarVitrina(planes: Plan[]): Omit<EstadoVitrina, 'cargando' | 'error'> {
    const pagados = planes.filter((p) => this.categoria(p) === 'pagado');
    const complementarios = planes.filter((p) => this.categoria(p) === 'complementario');

    // El valor base es el del plan pagado que cubre menos establecimientos (Escolar).
    const conValor = pagados.filter((p) => this.valorPorEstablecimiento(p) !== null);
    const base = conValor.length
      ? this.valorPorEstablecimiento(
          conValor.reduce((a, b) => ((a.establecimientos ?? 0) <= (b.establecimientos ?? 0) ? a : b))
        )
      : null;

    const tarjeta = (plan: Plan): TarjetaPlan => {
      const valor = this.valorPorEstablecimiento(plan);
      const ahorro = valor !== null && base ? Math.round((1 - valor / base) * 100) : 0;
      return {
        plan,
        precio: this.textoPrecio(plan),
        porEstablecimiento: valor !== null ? `${this.clp(valor)} c/u` : '',
        ahorro: ahorro > 0 ? ahorro : 0,
      };
    };

    return { pagados: pagados.map(tarjeta), complementarios: complementarios.map(tarjeta) };
  }

  /** Planes antiguos sin categoría: los de precio fijo cuentan como pagados. */
  private categoria(plan: Plan): CategoriaPlan {
    if (plan.categoria) return plan.categoria;
    return plan.requierePago && !plan.requiereCotizacion ? 'pagado' : 'complementario';
  }

  private valorPorEstablecimiento(plan: Plan): number | null {
    if (!plan.precio || !plan.establecimientos) return null;
    return Math.round(plan.precio / plan.establecimientos);
  }

  /** Precio formateado, o el texto que corresponda cuando no hay valor fijo. */
  private textoPrecio(plan: Plan): string {
    if (plan.requiereCotizacion) return 'Según convenio';
    if (!plan.requierePago) return 'Sin costo';
    if (plan.precio === null) return 'Por definir';
    return this.clp(plan.precio);
  }

  private clp(valor: number): string {
    return valor.toLocaleString('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    });
  }
}
