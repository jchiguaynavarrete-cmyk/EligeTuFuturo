import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { filter, take } from 'rxjs/operators';

import { AuthService } from '../services/auth.service';

/**
 * Exige sesión iniciada y correo verificado.
 *
 * Espera a que el servicio resuelva la sesión guardada: si se consultara
 * de inmediato, una recarga de página expulsaría a quien sí tiene sesión,
 * porque todavía no se ha leído del almacenamiento.
 */
export const authGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await authService.recargarUsuario();
  const user = authService.getCurrentUser();

  if (!user) return router.createUrlTree(['/auth']);

  if (!authService.correoVerificado()) {
    return router.createUrlTree(['/verificar-cuenta']);
  }

  return true;
};
