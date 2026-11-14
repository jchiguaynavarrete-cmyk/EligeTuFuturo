import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { AuthService } from '../services/auth.service';
import { UsuarioService } from '../services/usuario.service';

/**
 * Solo administradores.
 *
 * El rol se lee del perfil, y las políticas de la base lo verifican otra
 * vez en cada consulta: aunque alguien escribiera la dirección a mano, no
 * obtendría datos.
 */
export const adminGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const usuarioService = inject(UsuarioService);
  const router = inject(Router);

  const uid = authService.getUid();
  if (!uid) return of(router.createUrlTree(['/auth']));

  return usuarioService.getUsuario(uid).pipe(
    map((perfil) =>
      perfil?.rol === 'admin' ? true : router.createUrlTree(['/tabs/carreras'])
    )
  );
};
