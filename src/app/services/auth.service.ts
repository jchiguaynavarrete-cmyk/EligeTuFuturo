import { Injectable, inject, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import {
  Auth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  reload,
  User
} from '@angular/fire/auth';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);
  private injector = inject(EnvironmentInjector);

  private currentUserSubject = new BehaviorSubject<User | null>(null);
  user$ = this.currentUserSubject.asObservable();

  constructor() {
    runInInjectionContext(this.injector, () => {
      onAuthStateChanged(this.auth, (user) => this.currentUserSubject.next(user));
    });
  }

  registrar(email: string, password: string) {
    return runInInjectionContext(this.injector, () =>
      createUserWithEmailAndPassword(this.auth, email, password)
    );
  }

  login(email: string, password: string) {
    return runInInjectionContext(this.injector, () =>
      signInWithEmailAndPassword(this.auth, email, password)
    );
  }

  logout() {
    return runInInjectionContext(this.injector, () => signOut(this.auth));
  }

  getUid(): string | null {
    return this.currentUserSubject.value?.uid ?? null;
  }

  getCurrentUser(): User | null {
    return this.auth.currentUser;
  }

  enviarVerificacion(user?: User) {
    return runInInjectionContext(this.injector, async () => {
      const u = user ?? this.auth.currentUser;
      if (!u) throw new Error('No hay usuario para verificar');
      await sendEmailVerification(u);
    });
  }

  /**
   * Envía el correo de restablecimiento de contraseña.
   * Firebase genera un enlace temporal donde la persona define una clave nueva.
   */
  recuperarPassword(email: string) {
    return runInInjectionContext(this.injector, () =>
      sendPasswordResetEmail(this.auth, email.trim())
    );
  }

  recargarUsuario() {
    return runInInjectionContext(this.injector, async () => {
      const u = this.auth.currentUser;
      if (!u) return;
      await reload(u);
      // onAuthStateChanged normalmente actualizará, pero dejamos consistente:
      this.currentUserSubject.next(this.auth.currentUser);
    });
  }
}
