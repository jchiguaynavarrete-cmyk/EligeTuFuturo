import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import { UsuarioService } from '../services/usuario.service';
import { Observable, of } from 'rxjs';
import { map, take } from 'rxjs/operators';

export const adminGuard: CanActivateFn =
  (): Observable<boolean | UrlTree> => {

  const auth = inject(Auth);
  const usuarioService = inject(UsuarioService);
  const router = inject(Router);

  const user = auth.currentUser;

  // 🔒 no logueado
  if (!user) {
    return of(router.createUrlTree(['/auth']));
  }

  // 🔒 verificar rol en Firestore
  return usuarioService.getUsuario(user.uid).pipe(
    take(1),
    map(perfil => {
      if (perfil?.rol === 'admin') {
        return true;
      }
      // Sin permisos: de vuelta a la portada de la app.
      return router.createUrlTree(['/tabs/carreras']);
    })
  );
};
