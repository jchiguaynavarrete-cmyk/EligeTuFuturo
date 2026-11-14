import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
/*
 * Todo desde '@ionic/angular/standalone', igual que el resto de la app.
 *
 * La app arranca con provideIonicAngular() de /standalone, y en ese modo cada
 * componente registra su propio custom element al importarse. El IonicModule
 * clásico no lo hace: las etiquetas quedaban inertes (ion-datetime sin
 * calendario dentro) y los controladores se colgaban esperando un elemento
 * que nunca se definía. Si hace falta otro componente, hay que añadirlo aquí
 * y al array imports; no basta con escribir la etiqueta en el HTML.
 */
import {
  AlertController,
  LoadingController,
  ToastController,
  IonButton,
  IonButtons,
  IonContent,
  IonDatetime,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonText,
  IonToolbar,
} from '@ionic/angular/standalone';
import { FormsModule } from '@angular/forms';
import { AuthService } from 'src/app/services/auth.service';
import { UsuarioService } from 'src/app/services/usuario.service';
import { ActivatedRoute, Router } from '@angular/router';
import { take } from 'rxjs/operators';

import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  arrowForwardOutline,
  calendarOutline,
  chevronDownOutline,
} from 'ionicons/icons';

type PendingRegistro = {
  email: string;
  nombre: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  rut: string;
  fechaNacimientoStr: string;
};

/** Los tres campos del nombre, para recorrerlos sin repetir código. */
type CampoNombre = 'nombres' | 'apellidoPaterno' | 'apellidoMaterno';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonButton,
    IonButtons,
    IonContent,
    IonDatetime,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonLabel,
    IonText,
    IonToolbar,
  ],
  templateUrl: './auth.page.html',
  styleUrls: ['./auth.page.scss'],
})
export class AuthPage implements OnInit {
  private authService = inject(AuthService);
  private usuarioService = inject(UsuarioService);
  private loadingCtrl = inject(LoadingController);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  email = '';
  password = '';
  passwordConfirm = '';

  nombres = '';
  apellidoPaterno = '';
  apellidoMaterno = '';

  rut = '';
  fechaNacimientoStr = '';
  modo: 'login' | 'register' = 'login';

  showPasswordRules = false;
  /**
   * Un campo solo muestra su resultado —rojo o ✓— después de que la persona
   * sale de él o pulsa Registrarse. Mientras escribe no se la interrumpe.
   */
  rutSalido = false;
  nombreSalido: Record<CampoNombre, boolean> = {
    nombres: false,
    apellidoPaterno: false,
    apellidoMaterno: false,
  };

  /** Límites del calendario: ni fechas futuras ni más de 100 años atrás. */
  readonly fechaMaxima = new Date().toISOString().split('T')[0];
  readonly fechaMinima = new Date(new Date().getFullYear() - 100, 0, 1)
    .toISOString()
    .split('T')[0];

  // Sin atributo `pattern` en el HTML a propósito: Chrome y Edge compilan ese
  // atributo con el flag `v`, que exige escapar ( ) { } | / dentro de una clase
  // de caracteres. El patrón de contraseña no compilaba, el navegador daba el
  // campo por inválido y bloqueaba el submit en silencio, también al iniciar
  // sesión. La validación real vive en validarPasswordFinal(), que además
  // explica qué falta.

  /** Pantalla a la que se entra después de iniciar sesión. */
  private readonly rutaTrasLogin = '/tabs/carreras';

  constructor() {
    addIcons({
      arrowBackOutline,
      arrowForwardOutline,
      calendarOutline,
      chevronDownOutline,
    });
  }

  // 🚀 Auto-login
  ngOnInit(): void {
    // La bienvenida enlaza aquí con ?modo=register para abrir derecho el
    // formulario de registro, en vez de obligar a pasar por el login.
    if (this.route.snapshot.queryParamMap.get('modo') === 'register') {
      this.modo = 'register';
    }

    this.authService.user$.pipe(take(1)).subscribe((user) => {
      if (user?.id) {
        if (!this.authService.correoVerificado()) {
          this.router.navigateByUrl('/verificar-cuenta', { replaceUrl: true });
        } else {
          this.router.navigateByUrl(this.rutaTrasLogin, { replaceUrl: true });
        }
      }
    });
  }

  /**
   * Vuelve a la bienvenida.
   *
   * Navegación explícita y no un ion-back-button: a /auth se puede llegar
   * de frente por URL, y entonces no hay historial al que volver.
   */
  volverAInicio(): void {
    this.router.navigateByUrl('/bienvenida');
  }

  // ---------------- Nombre ----------------
  /** Partículas de apellidos compuestos: van en minúscula salvo al inicio. */
  private readonly particulas = ['de', 'del', 'la', 'las', 'los', 'y', 'da', 'van', 'von'];

  /**
   * Deja solo letras, espacios, apóstrofo y guion.
   * Bloquea números y símbolos en el momento de escribir.
   */
  private sanitizarNombre(valor: string): string {
    return (valor || '')
      .replace(/[^a-zA-ZáéíóúÁÉÍÓÚàèìòùÀÈÌÒÙäëïöüÄËÏÖÜñÑçÇ'\- ]/g, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/^\s+/, '');
  }

  /** Reglas por campo: cuántas palabras admite y cómo llamarlo en los avisos. */
  private readonly reglasNombre: Record<
    CampoNombre,
    { etiqueta: string; maxPalabras: number; maxLargo: number; opcional?: boolean }
  > = {
    nombres: { etiqueta: 'tus nombres', maxPalabras: 3, maxLargo: 40 },
    apellidoPaterno: { etiqueta: 'tu apellido paterno', maxPalabras: 3, maxLargo: 30 },
    // Opcional: hay personas extranjeras con un solo apellido.
    apellidoMaterno: {
      etiqueta: 'tu apellido materno',
      maxPalabras: 3,
      maxLargo: 30,
      opcional: true,
    },
  };

  onNombreInput(event: any, campo: CampoNombre) {
    const limpio = this.sanitizarNombre((event?.detail?.value ?? '') as string);

    this[campo] = limpio;

    // Al retomar la escritura se oculta el resultado hasta volver a salir:
    // si no, editar algo ya validado se pinta de error con la primera letra.
    this.nombreSalido[campo] = false;

    const input = event?.target;
    if (input && input.value !== limpio) {
      input.value = limpio;
    }
  }

  /** Al salir: colapsa espacios y deja cada palabra con mayúscula inicial. */
  onNombreBlur(campo: CampoNombre) {
    this.nombreSalido[campo] = true;
    this[campo] = this.capitalizar(this[campo]);
  }

  private capitalizar(valor: string): string {
    return this.sanitizarNombre(valor)
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((p, i) => {
        const min = p.toLowerCase();
        if (i > 0 && this.particulas.includes(min)) return min;
        return min.charAt(0).toUpperCase() + min.slice(1);
      })
      .join(' ');
  }

  campoNombreValido(campo: CampoNombre): boolean {
    const regla = this.reglasNombre[campo];
    const texto = (this[campo] || '').trim();
    const palabras = texto.split(/\s+/).filter(Boolean);

    // Un campo opcional vacío es válido; si trae algo, se valida igual que el resto.
    if (!texto) return !!regla.opcional;

    if (palabras.length > regla.maxPalabras) return false;
    if (texto.length > regla.maxLargo) return false;

    // Cada palabra: solo letras (más apóstrofo/guion internos) y 2+ caracteres,
    // salvo las partículas, que son más cortas.
    return palabras.every((p) => {
      if (this.particulas.includes(p.toLowerCase())) return true;

      // Una misma letra repetida no es un nombre ("SS", "AAA").
      const soloLetras = p.replace(/['-]/g, '').toLowerCase();
      if (new Set(soloLetras).size === 1) return false;

      // Tampoco 3 letras iguales seguidas ("Juaaan").
      if (/(.)\1{2,}/i.test(soloLetras)) return false;

      // Toda palabra debe tener al menos una vocal; descarta tecleos como
      // "Sd" o "Bcd". La "y" cuenta, porque hace de vocal en nombres (Lyn).
      // Contrapartida asumida: rechaza apellidos sin vocal, como "Ng".
      if (!/[aeiouáéíóúàèìòùäëïöüy]/i.test(soloLetras)) return false;

      return (
        /^[a-zA-ZáéíóúÁÉÍÓÚàèìòùÀÈÌÒÙäëïöüÄËÏÖÜñÑçÇ]+(['-][a-zA-ZáéíóúÁÉÍÓÚñÑüÜçÇ]+)*$/.test(p) &&
        p.length >= 2
      );
    });
  }

  campoNombreError(campo: CampoNombre): string {
    // Nada hasta que salga del campo o envíe el formulario.
    if (!this.nombreSalido[campo]) return '';

    const regla = this.reglasNombre[campo];
    const texto = (this[campo] || '').trim();
    const palabras = texto.split(/\s+/).filter(Boolean);

    if (!texto) return regla.opcional ? '' : `Ingresa ${regla.etiqueta}.`;

    if (texto.length > regla.maxLargo) return 'Es demasiado largo.';
    if (palabras.length > regla.maxPalabras) {
      return `Usa hasta ${regla.maxPalabras} palabras.`;
    }
    if (!this.campoNombreValido(campo)) {
      return 'Revisa lo que escribiste: no parece un nombre.';
    }

    return '';
  }

  /** Lo que se guarda en la BD como `nombre`: los tres campos unidos. */
  get nombreCompleto(): string {
    return [this.nombres, this.apellidoPaterno, this.apellidoMaterno]
      .map((p) => (p || '').trim())
      .filter(Boolean)
      .join(' ');
  }

  get nombreValido(): boolean {
    return (
      this.campoNombreValido('nombres') &&
      this.campoNombreValido('apellidoPaterno') &&
      this.campoNombreValido('apellidoMaterno')
    );
  }

  // ---------------- RUT utils ----------------
  private limpiarRut(rut: string): string {
    return (rut || '').replace(/\./g, '').replace(/-/g, '').trim().toUpperCase();
  }

  /** Inserta los puntos de miles en el cuerpo del RUT. */
  private puntearCuerpo(cuerpo: string): string {
    let out = '';
    let i = cuerpo.length;
    while (i > 3) {
      out = '.' + cuerpo.slice(i - 3, i) + out;
      i -= 3;
    }
    return cuerpo.slice(0, i) + out;
  }

  private formatearRut(rut: string): string {
    const r = this.limpiarRut(rut);
    if (r.length < 2) return rut;

    return `${this.puntearCuerpo(r.slice(0, -1))}-${r.slice(-1)}`;
  }

  /**
   * Deja el texto en un RUT válido *mientras* se escribe:
   * descarta cualquier carácter que no sea dígito o K, permite la K
   * solo como dígito verificador, corta en 8 dígitos de cuerpo y
   * va poniendo puntos y guion.
   */
  private sanitizarRut(valor: string): string {
    let limpio = (valor || '').toUpperCase().replace(/[^0-9K]/g, '');

    // La K solo vale como verificador: se eliminan las que no van al final.
    limpio = limpio.replace(/K(?=.)/g, '');

    // Máximo 8 dígitos de cuerpo + 1 verificador.
    limpio = limpio.slice(0, 9);

    if (limpio.length < 2) return limpio;

    return `${this.puntearCuerpo(limpio.slice(0, -1))}-${limpio.slice(-1)}`;
  }

  onRutInput(event: any) {
    const valor = (event?.detail?.value ?? '') as string;
    const formateado = this.sanitizarRut(valor);

    this.rut = formateado;

    // Igual que en el nombre: al escribir se oculta el resultado
    // hasta volver a salir del campo.
    this.rutSalido = false;

    // ion-input mantiene su propio valor interno; si lo que escribieron
    // trae caracteres descartados hay que devolverle el texto corregido.
    const input = event?.target;
    if (input && input.value !== formateado) {
      input.value = formateado;
    }
  }

  onRutBlur() {
    this.rut = this.formatearRut(this.rut);
    this.rutSalido = true;
  }

  private validarRut(rut: string): boolean {
    const rutLimpio = this.limpiarRut(rut);
    if (!/^[0-9]+[0-9K]$/.test(rutLimpio)) return false;

    const cuerpo = rutLimpio.slice(0, -1);
    const dv = rutLimpio.slice(-1);

    if (cuerpo.length < 7 || cuerpo.length > 8) return false;

    return this.dvEsperado(cuerpo) === dv;
  }

  get rutValido(): boolean {
    return this.validarRut(this.rut);
  }

  /** Mensaje bajo el campo. Vacío = sin error que mostrar. */
  get rutError(): string {
    // Nada hasta que salga del campo o envíe el formulario.
    if (!this.rutSalido) return '';

    const limpio = this.limpiarRut(this.rut);
    if (!limpio) return 'Ingresa tu RUT.';

    return this.rutValido ? '' : 'RUT inválido.';
  }

  /** Dígito verificador que corresponde a un cuerpo dado (módulo 11). */
  private dvEsperado(cuerpo: string): string {
    let suma = 0;
    let multiplicador = 2;

    for (let i = cuerpo.length - 1; i >= 0; i--) {
      suma += parseInt(cuerpo.charAt(i), 10) * multiplicador;
      multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
    }

    const resto = 11 - (suma % 11);
    return resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
  }
  // ------------------------------------------

  // ---------------- Fecha de nacimiento ----------------
  /**
   * Saca año/mes/día del valor del datetime leyendo el texto.
   * `new Date('2000-10-12')` se interpreta como medianoche UTC, así que
   * en Chile (UTC-3/-4) los getters locales devuelven el día anterior.
   * Leer los números del string evita ese corrimiento.
   */
  private partesFecha(valor: string): { y: number; m: number; d: number } | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor || '');
    if (!match) return null;

    const y = +match[1];
    const m = +match[2];
    const d = +match[3];

    // Descarta fechas que no existen (ej: 31 de febrero).
    const prueba = new Date(Date.UTC(y, m - 1, d));
    if (
      prueba.getUTCFullYear() !== y ||
      prueba.getUTCMonth() !== m - 1 ||
      prueba.getUTCDate() !== d
    ) {
      return null;
    }

    return { y, m, d };
  }

  /** Texto legible de la fecha elegida, para confirmar visualmente. */
  get fechaNacimientoTexto(): string {
    const p = this.partesFecha(this.fechaNacimientoStr);
    if (!p) return '';

    return new Date(Date.UTC(p.y, p.m - 1, p.d)).toLocaleDateString('es-CL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  get edad(): number | null {
    const p = this.partesFecha(this.fechaNacimientoStr);
    if (!p) return null;

    const hoy = new Date();
    let años = hoy.getFullYear() - p.y;

    const mes = hoy.getMonth() + 1 - p.m;
    if (mes < 0 || (mes === 0 && hoy.getDate() < p.d)) {
      años--;
    }

    return años;
  }

  get fechaError(): string {
    if (!this.fechaNacimientoStr) return '';

    const edad = this.edad;
    if (edad === null) return 'Fecha inválida.';
    if (edad < 0) return 'La fecha no puede estar en el futuro.';
    if (edad < 12) return 'Debes tener al menos 12 años para registrarte.';
    if (edad > 100) return 'Revisa el año: la fecha parece incorrecta.';

    return '';
  }

  /** El calendario parte plegado; se abre al tocar la fila. */
  mostrarCalendario = false;

  abrirCalendario() {
    this.mostrarCalendario = true;
  }

  toggleCalendario() {
    this.mostrarCalendario = !this.mostrarCalendario;
  }

  /** "Listo": confirma el día marcado y cierra el calendario. */
  async confirmarFecha(datetime: any) {
    await datetime?.confirm?.();
    this.mostrarCalendario = false;
  }

  /** "Cancelar": descarta el día marcado y cierra sin tocar la fecha guardada. */
  async cancelarFecha(datetime: any) {
    await datetime?.cancel?.();
    this.mostrarCalendario = false;
  }

  // ---------------- Password helpers ----------------
  private getChecks(pw: string) {
    const p = pw || '';

    const checks = {
      length: p.length >= 8 && p.length <= 64,
      upper: /[A-Z]/.test(p),
      lower: /[a-z]/.test(p),
      number: /[0-9]/.test(p),
      symbol: /[!@#$%^&*()_\-+=\[\]{};:'",.<>/?\\|`~]/.test(p),
      noSpaces: !/\s/.test(p),
    };

    const score = Object.values(checks).filter(Boolean).length; // 0..6
    const percent = Math.round((score / 6) * 100);

    let label = 'Débil';
    if (score === 6) label = 'Fuerte';
    else if (score >= 4) label = 'Media';

    return { checks, score, percent, label, completa: score === 6 };
  }

  get passwordStatus() {
    return this.getChecks(this.password);
  }

  private validarPasswordFinal(pw: string): { ok: boolean; msg: string } {
    const s = this.getChecks(pw);

    if (!s.checks.length) return { ok: false, msg: 'Mínimo 8 y máximo 64 caracteres.' };
    if (!s.checks.upper) return { ok: false, msg: 'Falta al menos 1 mayúscula.' };
    if (!s.checks.lower) return { ok: false, msg: 'Falta al menos 1 minúscula.' };
    if (!s.checks.number) return { ok: false, msg: 'Falta al menos 1 número.' };
    if (!s.checks.symbol) return { ok: false, msg: 'Falta al menos 1 símbolo.' };
    if (!s.checks.noSpaces) return { ok: false, msg: 'No se permiten espacios.' };

    return { ok: true, msg: '' };
  }

  get passwordsMatch(): boolean {
    if (this.modo !== 'register') return true;
    if (!this.passwordConfirm) return false;
    return this.password === this.passwordConfirm;
  }

  get canSubmitRegister(): boolean {
    if (this.modo !== 'register') return true;

    if (!this.nombreValido) return false;
    if (!this.email.trim()) return false;
    if (!this.fechaNacimientoStr) return false;
    if (this.fechaError) return false;

    if (!this.validarRut(this.rut)) return false;

    const pass = this.validarPasswordFinal(this.password);
    if (!pass.ok) return false;

    if (this.password !== this.passwordConfirm) return false;

    return true;
  }
  // -----------------------------------------------

  private savePendingRegistro() {
    const payload: PendingRegistro = {
      email: this.email,
      nombre: this.nombreCompleto,
      nombres: this.nombres,
      apellidoPaterno: this.apellidoPaterno,
      apellidoMaterno: this.apellidoMaterno,
      rut: this.rut,
      fechaNacimientoStr: this.fechaNacimientoStr,
    };
    localStorage.setItem('pending_registro', JSON.stringify(payload));
  }

  private getPendingRegistro(): PendingRegistro | null {
    const raw = localStorage.getItem('pending_registro');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private clearPendingRegistro() {
    localStorage.removeItem('pending_registro');
  }

  async enviar() {
    const loading = await this.loadingCtrl.create({ message: 'Procesando...' });
    await loading.present();

    try {
      if (this.modo === 'login') {
        await this.authService.login(this.email, this.password);
        await this.authService.recargarUsuario();

        if (!this.authService.correoVerificado()) {
          await this.authService.logout();
          await this.mostrarToast('Debes verificar tu correo antes de entrar. Revisa tu email 📩');
          this.router.navigateByUrl('/verificar-cuenta', { replaceUrl: true });
          return;
        }

        // El perfil ya existe: lo crea el disparador `al_crear_usuario`
        // con los datos que viajaron en el registro. Ya no hace falta
        // guardarlos en localStorage ni crearlos desde aquí.
        this.clearPendingRegistro();

        this.mostrarToast('Login exitoso ✅');
        this.router.navigateByUrl(this.rutaTrasLogin, { replaceUrl: true });
        return;
      }

      // REGISTER
      this.showPasswordRules = true;
      // Al enviar se revelan todos los resultados de una vez.
      this.rutSalido = true;
      (['nombres', 'apellidoPaterno', 'apellidoMaterno'] as CampoNombre[]).forEach((c) => {
        this.nombreSalido[c] = true;
      });

      if (!this.nombreValido) {
        const campo = (['nombres', 'apellidoPaterno', 'apellidoMaterno'] as CampoNombre[]).find(
          (c) => !this.campoNombreValido(c)
        );
        await this.mostrarToast(
          campo ? `Revisa ${this.reglasNombre[campo].etiqueta}.` : 'Revisa tus datos.'
        );
        return;
      }

      if (!this.validarRut(this.rut)) {
        await this.mostrarToast('RUT inválido. Revisa número y dígito verificador.');
        return;
      }

      if (!this.fechaNacimientoStr) {
        await this.mostrarToast('Ingresa tu fecha de nacimiento.');
        return;
      }

      if (this.fechaError) {
        await this.mostrarToast(this.fechaError);
        return;
      }

      const pass = this.validarPasswordFinal(this.password);
      if (!pass.ok) {
        await this.mostrarToast('Contraseña débil: ' + pass.msg);
        return;
      }

      if (this.password !== this.passwordConfirm) {
        await this.mostrarToast('Las contraseñas no coinciden.');
        return;
      }

      // El RUT se comprueba antes para dar un mensaje claro; la base lo
      // garantiza igual con una restricción unique si dos registros
      // llegaran a la vez.
      const rutLibre = await this.usuarioService.rutDisponible(this.rut);
      if (!rutLibre) {
        await this.mostrarToast('Este RUT ya está registrado.');
        return;
      }

      // Los datos del perfil viajan con la cuenta: el disparador
      // `al_crear_usuario` crea la fila en `perfiles`. Así no puede quedar
      // una cuenta sin perfil si el navegador se cierra a medio camino.
      await this.authService.registrar(this.email, this.password, {
        nombre: this.nombreCompleto,
        nombres: this.nombres,
        apellidoPaterno: this.apellidoPaterno,
        apellidoMaterno: this.apellidoMaterno,
        rut: this.rut,
        rutLimpio: this.limpiarRut(this.rut),
        fechaNacimiento: this.fechaNacimientoStr.slice(0, 10),
        edad: this.edad ?? 0,
      });

      await this.authService.logout();

      await this.mostrarToast('Te enviamos un correo de verificación 📩. Verifica y luego inicia sesión.');
      this.router.navigateByUrl('/verificar-cuenta', { replaceUrl: true });
    } catch (err: any) {
      console.error(err);

      const mensaje = this.authService.mensajeDeError(err);

      this.mostrarToast(mensaje);
    } finally {
      loading.dismiss();
    }
  }

  // ---------------- Recuperar contraseña ----------------
  private esEmailValido(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
  }

  /** Abre el diálogo para pedir el correo al que mandar el enlace de recuperación. */
  async recuperarPassword() {
    const alert = await this.alertCtrl.create({
      header: '¿Olvidaste tu contraseña?',
      message:
        'Escribe tu correo y te enviaremos un enlace para crear una contraseña nueva.',
      inputs: [
        {
          name: 'email',
          type: 'email',
          placeholder: 'tucorreo@ejemplo.com',
          value: this.email,
        },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Enviar enlace', role: 'enviar' },
      ],
    });

    await alert.present();

    // Igual que en el panel de administración: el envío ocurre una vez
    // cerrado el diálogo, para que el cartel de carga no choque con él.
    const { role, data } = await alert.onDidDismiss();
    if (role !== 'enviar') return;

    await this.enviarCorreoRecuperacion(data?.values?.email ?? '');
  }

  private async enviarCorreoRecuperacion(email: string) {
    const destino = (email || '').trim();

    if (!this.esEmailValido(destino)) {
      await this.mostrarToast('Escribe un correo válido.');
      return;
    }

    const loading = await this.loadingCtrl.create({ message: 'Enviando enlace...' });
    await loading.present();

    let errorVisible = '';

    try {
      await this.authService.recuperarPassword(destino);
    } catch (err: any) {
      console.error(err);

      // Solo estos dos se le muestran a la persona.
      if (err?.code === 'auth/invalid-email') {
        errorVisible = 'El correo no es válido.';
      } else if (err?.code === 'auth/too-many-requests') {
        errorVisible = 'Demasiados intentos. Espera unos minutos.';
      }

      // El resto (p. ej. auth/user-not-found) se silencia a propósito:
      // confirmar si un correo existe permitiría enumerar usuarios.
    } finally {
      await loading.dismiss();
    }

    // Sin error visible, el mensaje es idéntico exista o no la cuenta.
    await this.mostrarToast(
      errorVisible ||
        'Si el correo está registrado, te enviamos el enlace 📩 Revisa tu bandeja y spam.'
    );
  }
  // ------------------------------------------------------

  async mostrarToast(message: string) {
    const toast = await this.toastCtrl.create({ message, duration: 2200 });
    await toast.present();
  }

  cambiarModo() {
    this.modo = this.modo === 'login' ? 'register' : 'login';
    this.passwordConfirm = '';
    this.showPasswordRules = false;
    this.rutSalido = false;
    (['nombres', 'apellidoPaterno', 'apellidoMaterno'] as CampoNombre[]).forEach((c) => {
      this.nombreSalido[c] = false;
    });
    this.mostrarCalendario = false;
  }
}
