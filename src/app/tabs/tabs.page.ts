import { Component, OnInit, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import {
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonIcon,
  IonLabel,
} from '@ionic/angular/standalone';
import { RouterModule } from '@angular/router';

import { addIcons } from 'ionicons';
import {
  home,
  school,
  personCircle,
  heartOutline,
  shieldCheckmark,
  calendarOutline,
  businessOutline,
} from 'ionicons/icons';

import { AuthService } from '../services/auth.service';
import { UsuarioService } from '../services/usuario.service';

@Component({
  selector: 'app-tabs',
  templateUrl: './tabs.page.html',
  styleUrls: ['./tabs.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonTabs,
    IonTabBar,
    IonTabButton,
    IonIcon,
    IonLabel,
    RouterModule,
  ],
})
export class TabsPage implements OnInit {

  esAdmin = false;

  /**
   * Una institución que todavía no paga ve otras pestañas.
   *
   * Si se le dejaran las de siempre, al tocarlas el guardia la devolvería
   * a su solicitud, y la aplicación parecería rota.
   */
  esInstitucionSinPlan = false;

  /**
   * Cualquier cuenta institucional, pague o no.
   *
   * Separado del anterior a propósito: "Mi plan" es su panel, y lo
   * necesita SIEMPRE -para ver la vigencia, para contratar otro plan,
   * para pagar-. Antes la pestaña solo aparecía mientras no tuviera
   * plan, así que al activarse desaparecía y la institución se quedaba
   * sin forma de volver a su propio panel.
   */
  esInstitucion = false;

  private authService = inject(AuthService);
  private usuarioService = inject(UsuarioService);
  private router = inject(Router);

  constructor() {
    // ✅ Registrar TODOS los íconos usados en tabs
    addIcons({
      home,
      school,
      personCircle,
      'heart-outline': heartOutline,
      'shield-checkmark': shieldCheckmark,
      'calendar-outline': calendarOutline,
      'business-outline': businessOutline,
    });
  }

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();

    if (!user) {
      this.esAdmin = false;
      return;
    }

    this.revisarAccesos(user.id);

    /*
     * La barra de pestañas se monta una sola vez y queda viva, así que
     * un cambio de estado -pagar un plan, que se venza- no se notaría
     * hasta recargar el navegador entero. Al terminar cada navegación se
     * vuelve a preguntar.
     */
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => {
        const actual = this.authService.getCurrentUser();
        if (actual) this.revisarAccesos(actual.id);
      });
  }

  /** Qué pestañas corresponden a esta persona, según la base. */
  private revisarAccesos(uid: string): void {
    // El rol se lee de la base, no de la sesión.
    this.usuarioService.getUsuario(uid).subscribe((perfil) => {
      this.esAdmin = perfil?.rol === 'admin';
      this.esInstitucion = perfil?.rol === 'institucion';
    });

    this.usuarioService
      .institucionConPlanPendiente(uid)
      .subscribe((pendiente) => (this.esInstitucionSinPlan = pendiente));
  }
}
