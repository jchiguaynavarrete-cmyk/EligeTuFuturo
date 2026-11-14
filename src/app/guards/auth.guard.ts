import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';

export const authGuard: CanActivateFn = (): Promise<boolean | UrlTree> => {
  const auth = inject(Auth);
  const router = inject(Router);

  return new Promise<boolean | UrlTree>((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();

      if (!user) {
        resolve(router.createUrlTree(['/auth']));
        return;
      }

      // ✅ logueado pero NO verificado
      if (!user.emailVerified) {
        resolve(router.createUrlTree(['/verificar-cuenta']));
        return;
      }

      // ✅ logueado y verificado
      resolve(true);
    });
  });
};
