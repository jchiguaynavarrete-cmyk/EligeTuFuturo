import { Routes } from '@angular/router';
import { TabsPage } from './tabs.page';
import { adminGuard } from '../guards/admin.guard';

export const routes: Routes = [
  {
    path: '',
    component: TabsPage,
    children: [
      {
        path: 'inicio',
        loadComponent: () =>
          import('../pages/favoritos/favoritos.page')
            .then(m => m.FavoritosPage),
      },
      {
        path: 'carreras',
        loadComponent: () =>
          import('../pages/carreras/carreras.page')
            .then(m => m.CarrerasPage),
      },
      {
        path: 'simulador',
        loadComponent: () =>
          import('../pages/simulador/simulador.page')
            .then(m => m.SimuladorPage),
      },
      {
        path: 'calendario', // ✅ AGREGADO
        loadComponent: () =>
          import('../pages/calendario/calendario.page')
            .then(m => m.CalendarioPage),
      },
      {
        path: 'cuenta',
        loadComponent: () =>
          import('../pages/cuenta/cuenta.page')
            .then(m => m.CuentaPage),
      },
      // ---- Planes institucionales (público para cualquier sesión) ----
      {
        path: 'planes',
        loadComponent: () =>
          import('../pages/planes/planes.page')
            .then(m => m.PlanesPage),
      },
      {
        path: 'planes/solicitud/:planId',
        loadComponent: () =>
          import('../pages/solicitud-plan/solicitud-plan.page')
            .then(m => m.SolicitudPlanPage),
      },
      {
        path: 'institucion',
        loadComponent: () =>
          import('../pages/estado-solicitud/estado-solicitud.page')
            .then(m => m.EstadoSolicitudPage),
      },
      {
        path: 'institucion/pagar/:solicitudId',
        loadComponent: () =>
          import('../pages/pagar-plan/pagar-plan.page')
            .then(m => m.PagarPlanPage),
      },
      {
        path: 'institucion/pago-confirmado',
        loadComponent: () =>
          import('../pages/pago-confirmado/pago-confirmado.page')
            .then(m => m.PagoConfirmadoPage),
      },

      {
        path: 'admin',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('../pages/admin/admin.page')
            .then(m => m.AdminPage),
      },
      {
        path: 'admin/carreras',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('../pages/admin-carreras/admin-carreras.page')
            .then(m => m.AdminCarrerasPage),
      },
      {
        path: 'admin/usuarios',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('../pages/admin-usuarios/admin-usuarios.page')
            .then(m => m.AdminUsuariosPage),
      },
      {
        path: 'admin/solicitudes',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('../pages/admin-solicitudes/admin-solicitudes.page')
            .then(m => m.AdminSolicitudesPage),
      },
      {
        path: '',
        redirectTo: 'carreras',
        pathMatch: 'full',
      },
    ],
  },
];
