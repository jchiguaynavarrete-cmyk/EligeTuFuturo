import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';

import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonButton,
  IonSkeletonText,
} from '@ionic/angular/standalone';

import { AuthService } from 'src/app/services/auth.service';
import { UsuarioService, UsuarioPerfil } from 'src/app/services/usuario.service';
import { Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-cuenta',
  standalone: true,
  templateUrl: './cuenta.page.html',
  styleUrls: ['./cuenta.page.scss'],
  imports: [
    CommonModule,
    RouterModule,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonButton,
    IonSkeletonText,
  ],
})
export class CuentaPage {
  private authService = inject(AuthService);
  private usuarioService = inject(UsuarioService);
  private router = inject(Router);

  perfil$: Observable<UsuarioPerfil | null>;

  constructor() {
    this.perfil$ = this.authService.user$.pipe(
      switchMap((u) => (u?.uid ? this.usuarioService.getUsuario(u.uid) : of(null)))
    );
  }

  getIniciales(nombre?: string | null): string {
    const n = (nombre || '').trim();
    if (!n) return 'U';
    const parts = n.split(' ').filter(Boolean);
    const a = parts[0]?.[0] ?? 'U';
    const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
    return (a + b).toUpperCase();
  }

  formatearFecha(fecha: any): string {
    try {
      const d: Date =
        fecha?.toDate?.() instanceof Date ? fecha.toDate() :
        fecha instanceof Date ? fecha :
        new Date(fecha);

      if (isNaN(d.getTime())) return '-';
      return new Intl.DateTimeFormat('es-CL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(d);
    } catch {
      return '-';
    }
  }

  async cerrarSesion() {
    await this.authService.logout();
    this.router.navigateByUrl('/auth', { replaceUrl: true });
  }
}
