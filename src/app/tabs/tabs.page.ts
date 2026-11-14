import { Component, OnInit, inject } from '@angular/core';
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
} from 'ionicons/icons';

import { Auth } from '@angular/fire/auth';
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

  private auth = inject(Auth);
  private usuarioService = inject(UsuarioService);

  constructor() {
    // ✅ Registrar TODOS los íconos usados en tabs
    addIcons({
      home,
      school,
      personCircle,
      'heart-outline': heartOutline,
      'shield-checkmark': shieldCheckmark,
      'calendar-outline': calendarOutline, // ✅ CALENDARIO
    });
  }

  ngOnInit(): void {
    const user = this.auth.currentUser;

    if (!user) {
      this.esAdmin = false;
      return;
    }

    // 🔐 Traer rol desde Firestore
    this.usuarioService.getUsuario(user.uid).subscribe((perfil) => {
      this.esAdmin = perfil?.rol === 'admin';
    });
  }
}
