import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent, IonIcon, IonSpinner } from '@ionic/angular/standalone';

import { addIcons } from 'ionicons';
import {
  analyticsOutline,
  compassOutline,
  documentTextOutline,
  peopleOutline,
  ribbonOutline,
  schoolOutline,
} from 'ionicons/icons';

import { Observable, of } from 'rxjs';
import { catchError, map, startWith } from 'rxjs/operators';

import { PlanesService } from 'src/app/services/planes.service';
import { Plan } from 'src/app/models/planes.model';

type EstadoPlanes = {
  cargando: boolean;
  error: string;
  planes: Plan[];
};

/**
 * Landing pública para instituciones.
 *
 * No exige sesión: quien evalúa contratar —un director, un DAEM, un SLEP—
 * necesita ver la propuesta antes de crear una cuenta. El orden es
 * deliberado: primero el valor, después lo que recibe, y los precios al
 * final, cuando ya sabe de qué se trata.
 */
@Component({
  selector: 'app-landing-institucional',
  standalone: true,
  templateUrl: './landing-institucional.page.html',
  styleUrls: ['./landing-institucional.page.scss'],
  imports: [CommonModule, IonContent, IonIcon, IonSpinner],
})
export class LandingInstitucionalPage {
  private planesService = inject(PlanesService);
  private router = inject(Router);

  estado$: Observable<EstadoPlanes>;

  /** Lo que recibe la institución. Es la vista previa de beneficios. */
  readonly beneficios = [
    {
      icono: 'analytics-outline',
      titulo: 'Reportes por curso',
      texto:
        'Qué áreas concentran el interés de cada 4° medio, para preparar la orientación con datos y no con impresiones.',
    },
    {
      icono: 'compass-outline',
      titulo: 'Orientación con evidencia',
      texto:
        'Tus orientadores ven qué carreras exploran los estudiantes y dónde se concentran las dudas.',
    },
    {
      icono: 'people-outline',
      titulo: 'Cobertura para todo el nivel',
      texto:
        'Acceso para todos los estudiantes de 4° medio del establecimiento, sin costo para las familias.',
    },
    {
      icono: 'document-text-outline',
      titulo: 'Reporte directivo',
      texto:
        'Un consolidado para el equipo directivo con la evolución del proceso vocacional del nivel.',
    },
  ];

  readonly argumentos = [
    'Decisiones vocacionales informadas reducen el cambio de carrera y la deserción en primer año.',
    'El estudiante compara carreras, instituciones y puntajes reales antes de postular.',
    'El establecimiento acompaña el proceso con datos, no con suposiciones.',
  ];

  constructor() {
    addIcons({
      analyticsOutline,
      compassOutline,
      documentTextOutline,
      peopleOutline,
      ribbonOutline,
      schoolOutline,
    });

    this.estado$ = this.planesService.listarPlanesActivos().pipe(
      map((planes) => ({ cargando: false, error: '', planes })),
      catchError((err) => {
        console.error(err);
        return of({
          cargando: false,
          planes: [] as Plan[],
          error: 'No pudimos cargar los planes. Escríbenos y te enviamos la información.',
        });
      }),
      startWith({ cargando: true, error: '', planes: [] as Plan[] })
    );
  }

  verDemo(): void {
    this.router.navigateByUrl('/demo');
  }

  /** Cada plan abre el formulario corto de contacto, no un pago. */
  solicitar(plan: Plan): void {
    this.router.navigate(['/institucional/contacto'], {
      queryParams: { plan: plan.id },
    });
  }

  contactoGeneral(): void {
    this.router.navigateByUrl('/institucional/contacto');
  }

  volver(): void {
    this.router.navigateByUrl('/bienvenida');
  }

  textoPrecio(plan: Plan): string {
    if (plan.requiereCotizacion) return 'Según convenio';
    if (!plan.requierePago) return 'Sin costo';
    if (plan.precio === null) return 'Por definir';

    return plan.precio.toLocaleString('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    });
  }

  trackPorId(_: number, plan: Plan): string {
    return plan.id;
  }
}
