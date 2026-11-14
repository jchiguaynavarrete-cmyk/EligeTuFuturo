import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonButton, IonContent, IonIcon } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { Subscription, filter, take } from 'rxjs';

import { addIcons } from 'ionicons';
import {
  heartOutline,
  locationOutline,
  schoolOutline,
  statsChartOutline,
} from 'ionicons/icons';

import { AuthService } from 'src/app/services/auth.service';

/** Una línea de "qué puedes hacer aquí", con su icono. */
type Ventaja = { icono: string; texto: string };

@Component({
  selector: 'app-bienvenida',
  standalone: true,
  imports: [CommonModule, IonButton, IonContent, IonIcon],
  templateUrl: './bienvenida.page.html',
  styleUrls: ['./bienvenida.page.scss'],
})
export class BienvenidaPage implements OnInit, OnDestroy {
  private router = inject(Router);
  private authService = inject(AuthService);

  private sub?: Subscription;

  readonly ventajas: Ventaja[] = [
    { icono: 'school-outline', texto: 'Explora carreras técnicas y profesionales' },
    { icono: 'location-outline', texto: 'Busca instituciones por región' },
    { icono: 'stats-chart-outline', texto: 'Simula tu puntaje PAES' },
    { icono: 'heart-outline', texto: 'Guarda tus favoritas y compáralas' },
  ];

  constructor() {
    addIcons({ heartOutline, locationOutline, schoolOutline, statsChartOutline });
  }

  /**
   * Quien ya tiene la sesión abierta no debería toparse con la bienvenida.
   *
   * `user$` es un BehaviorSubject que parte en null, así que se descarta ese
   * primer valor: si de verdad no hay sesión no vuelve a emitir y la pantalla
   * se queda puesta, que es justo lo que corresponde.
   */
  ngOnInit(): void {
    this.sub = this.authService.user$
      .pipe(
        filter((user) => !!user?.uid),
        take(1),
      )
      .subscribe((user) => {
        this.router.navigateByUrl(
          user!.emailVerified ? '/tabs/carreras' : '/verificar-cuenta',
          { replaceUrl: true },
        );
      });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  /** Acción principal: quien llega nuevo viene a crear su cuenta. */
  comenzar(): void {
    this.router.navigate(['/auth'], { queryParams: { modo: 'register' } });
  }

  /** Para quien ya tiene cuenta: el login tal cual estaba. */
  iniciarSesion(): void {
    this.router.navigateByUrl('/auth');
  }

  /**
   * Directores, DAEM, SLEP y Mineduc entran a la landing institucional.
   * Es pública a propósito: a quien evalúa contratar no se le pide cuenta
   * antes de mostrarle de qué se trata.
   */
  soyInstitucion(): void {
    this.router.navigateByUrl('/institucional');
  }
}
