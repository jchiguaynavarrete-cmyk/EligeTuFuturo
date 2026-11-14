import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  // =========================
  // BIENVENIDA (ENTRADA)
  // =========================
  {
    path: 'bienvenida',
    loadComponent: () =>
      import('./pages/bienvenida/bienvenida.page')
        .then(m => m.BienvenidaPage),
  },

  // =========================
  // AUTH
  // =========================
  {
    path: 'auth',
    loadComponent: () =>
      import('./pages/auth/auth.page')
        .then(m => m.AuthPage),
  },

  {
    path: 'verificar-cuenta',
    loadComponent: () =>
      import('./pages/verificar-cuenta/verificar-cuenta.page')
        .then(m => m.VerificarCuentaPage),
  },

  // =========================
  // TABS (APP PRINCIPAL)
  // =========================
  // ---- Zona institucional (B2B). Pública a propósito: quien evalúa
  // ---- contratar necesita ver la propuesta antes de crear una cuenta.
  {
    path: 'institucional',
    loadComponent: () =>
      import('./pages/landing-institucional/landing-institucional.page')
        .then(m => m.LandingInstitucionalPage),
  },
  {
    path: 'institucional/contacto',
    loadComponent: () =>
      import('./pages/contacto-institucional/contacto-institucional.page')
        .then(m => m.ContactoInstitucionalPage),
  },
  {
    path: 'demo',
    loadComponent: () =>
      import('./pages/demo/demo.page')
        .then(m => m.DemoPage),
  },

  {
    path: 'tabs',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./tabs/tabs.routes')
        .then(m => m.routes),
  },

  // =========================
  // REDIRECCIONES
  // =========================
  {
    path: '',
    redirectTo: 'bienvenida',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'bienvenida',
  },
];
