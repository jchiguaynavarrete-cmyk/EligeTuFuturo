import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';

import { AuthService } from '../services/auth.service';
import { UsuarioService } from '../services/usuario.service';

/**
 * Cierra el catálogo a las instituciones que aún no pagan.
 *
 * Una institución contrata el acceso para sus estudiantes. Dejarla
 * recorrer carreras, favoritos y simulador antes de pagar es entregarle
 * justo aquello por lo que está pagando.
 *
 * No las deja fuera: las lleva a su estado de solicitud, que es donde
 * está el botón de pagar.
 *
 * Estudiantes y administradores pasan siempre. Y aunque alguien escribiera
 * la dirección a mano, las políticas de la base verifican los permisos
 * otra vez en cada consulta.
 */
export const institucionPagadaGuard: CanActivateFn = ():
  | Observable<boolean | UrlTree>
  | boolean
  | UrlTree => {
  const authService = inject(AuthService);
  const usuarioService = inject(UsuarioService);
  const router = inject(Router);

  const uid = authService.getUid();
  if (!uid) return router.createUrlTree(['/auth']);

  return usuarioService.institucionConPlanPendiente(uid).pipe(
    map((pendiente) =>
      pendiente ? router.createUrlTree(['/tabs/institucion']) : true
    )
  );
};
