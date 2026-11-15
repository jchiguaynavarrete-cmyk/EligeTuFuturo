import { Injectable, inject } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { SupabaseClientService } from '../core/supabase.client';
import { AuthService } from './auth.service';
import { environment } from 'src/environments/environment';

/**
 * Perfil de una persona.
 *
 * Las propiedades mantienen los nombres que ya usaban las páginas; la
 * conversión desde los nombres de columna de PostgreSQL se hace aquí.
 */
export interface UsuarioPerfil {
  uid: string;
  email: string;
  nombre: string;
  nombres?: string;
  apellidoPaterno?: string;
  apellidoMaterno?: string;
  rut: string;
  rut_limpio?: string;
  fechaNacimiento: any;
  edad: number;
  rol: 'user' | 'admin' | 'institucion';
  institucionId?: string;
  creadoEn: any;
}

@Injectable({ providedIn: 'root' })
export class UsuarioService {
  private supabase = inject(SupabaseClientService).cliente;
  private authService = inject(AuthService);

  private limpiarRut(rut: string): string {
    return (rut || '').replace(/\./g, '').replace(/-/g, '').trim().toUpperCase();
  }

  private calcularEdad(fechaNac: Date): number {
    const hoy = new Date();
    let edad = hoy.getFullYear() - fechaNac.getFullYear();
    const m = hoy.getMonth() - fechaNac.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < fechaNac.getDate())) edad--;
    return edad;
  }

  /** Traduce una fila de `perfiles` a la forma que usan las páginas. */
  private aPerfil(f: any): UsuarioPerfil {
    return {
      uid: f.id,
      email: f.email,
      nombre: f.nombre,
      nombres: f.nombres ?? undefined,
      apellidoPaterno: f.apellido_paterno ?? undefined,
      apellidoMaterno: f.apellido_materno ?? undefined,
      rut: f.rut,
      rut_limpio: f.rut_limpio ?? undefined,
      fechaNacimiento: f.fecha_nacimiento,
      edad: f.edad,
      rol: f.rol,
      institucionId: f.institucion_id ?? undefined,
      creadoEn: f.creado_en,
    };
  }

  async perfilExiste(uid: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('perfiles')
      .select('id')
      .eq('id', uid)
      .maybeSingle();

    if (error) throw error;
    return !!data;
  }

  /**
   * Comprueba si un RUT ya está tomado.
   *
   * Ya no hace falta la colección `rut_index`: la columna `rut_limpio`
   * tiene una restricción `unique`, así que la base rechaza el duplicado
   * aunque dos registros lleguen a la vez.
   */
  async rutDisponible(rut: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('perfiles')
      .select('id')
      .eq('rut_limpio', this.limpiarRut(rut))
      .maybeSingle();

    if (error) throw error;
    return !data;
  }

  /**
   * Completa el perfil si el disparador no alcanzó a recibir algún dato.
   *
   * En el camino normal el perfil ya existe: lo crea `al_crear_usuario`
   * con los metadatos del registro.
   */
  async completarPerfil(
    uid: string,
    data: {
      email: string;
      nombre: string;
      nombres?: string;
      apellidoPaterno?: string;
      apellidoMaterno?: string;
      rut: string;
      fechaNacimiento: Date;
    }
  ): Promise<void> {
    const rutLimpio = this.limpiarRut(data.rut);

    const { error } = await this.supabase.from('perfiles').upsert(
      {
        id: uid,
        email: data.email,
        nombre: data.nombre,
        nombres: data.nombres ?? null,
        apellido_paterno: data.apellidoPaterno ?? null,
        apellido_materno: data.apellidoMaterno ?? null,
        rut: data.rut,
        rut_limpio: rutLimpio,
        fecha_nacimiento: data.fechaNacimiento.toISOString().slice(0, 10),
        edad: this.calcularEdad(data.fechaNacimiento),
      },
      { onConflict: 'id' }
    );

    if (error) throw error;
  }

  getUsuario(uid: string): Observable<UsuarioPerfil | null> {
    const consulta = this.supabase
      .from('perfiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle();

    return from(consulta).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data ? this.aPerfil(data) : null;
      })
    );
  }

  /** Lo que el panel puede crear o cambiar de una cuenta. */
  private async pedirAlBackend(
    ruta: string,
    metodo: 'POST' | 'PATCH',
    cuerpo: Record<string, unknown>
  ): Promise<void> {
    const token = await this.authService.getToken();
    if (!token) throw new Error('SIN_SESION');

    const r = await fetch(`${environment.apiPagosUrl}${ruta}`, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(cuerpo),
    });

    if (!r.ok) {
      const respuesta = await r.json().catch(() => ({}));
      throw new Error(this.explicarError((respuesta as any)?.error));
    }
  }

  /**
   * Crea una cuenta desde el panel.
   *
   * Nace con el correo ya confirmado y con el rol que se le indique: es
   * la única forma de dejar a alguien como institución o administrador
   * sin entrar a la base de datos.
   */
  async crearUsuario(datos: {
    email: string;
    password: string;
    nombres: string;
    apellidoPaterno: string;
    apellidoMaterno?: string;
    rut: string;
    rol: string;
  }): Promise<void> {
    await this.pedirAlBackend('/usuarios', 'POST', datos);
  }

  /** Cambia correo, nombre o rol de una cuenta. */
  async actualizarUsuario(
    uid: string,
    cambios: {
      email?: string;
      nombres?: string;
      apellidoPaterno?: string;
      apellidoMaterno?: string;
      rol?: string;
    }
  ): Promise<void> {
    await this.pedirAlBackend(`/usuarios/${uid}`, 'PATCH', cambios);
  }

  /** Traduce los códigos del backend a algo que se entienda en pantalla. */
  private explicarError(codigo: string | undefined): string {
    const textos: Record<string, string> = {
      CORREO_INVALIDO: 'Ese correo no tiene un formato válido.',
      CORREO_YA_REGISTRADO: 'Ya existe una cuenta con ese correo.',
      PASSWORD_CORTA: 'La contraseña debe tener al menos 8 caracteres.',
      FALTA_NOMBRE: 'Los nombres y el apellido paterno son obligatorios.',
      RUT_INVALIDO: 'Ese RUT no es válido. Revisa el dígito verificador.',
      RUT_YA_REGISTRADO: 'Ese RUT ya está registrado en otra cuenta.',
      ROL_INVALIDO: 'Ese rol no existe.',
      NO_TE_QUITES_ADMIN:
        'No puedes quitarte a ti mismo el rol de administrador: perderías ' +
        'el acceso al panel y no habría forma de volver.',
      NO_PUEDES_BORRARTE:
        'No puedes eliminar tu propia cuenta: quedarías fuera del sistema.',
      ULTIMO_ADMINISTRADOR:
        'Es el último administrador. Si lo cambias o lo eliminas, nadie ' +
        'podría gestionar usuarios, solicitudes ni planes.',
      SIN_PERMISO: 'Solo un administrador puede hacer esto.',
      USUARIO_NO_ENCONTRADO: 'Esa cuenta ya no existe.',
    };

    return textos[codigo || ''] || codigo || 'No se pudo completar la operación.';
  }

  /**
   * Elimina una cuenta por completo.
   *
   * Pasa por el backend porque borrar en Supabase Auth exige la llave de
   * servicio, que nunca viaja al navegador. Se lleva el perfil, los
   * favoritos y la institución con su plan; deja las solicitudes y los
   * pagos, que son respaldo de operaciones reales.
   */
  async eliminarUsuario(uid: string): Promise<void> {
    const token = await this.authService.getToken();
    if (!token) throw new Error('SIN_SESION');

    const r = await fetch(`${environment.apiPagosUrl}/usuarios/${uid}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!r.ok) {
      const cuerpo = await r.json().catch(() => ({}));
      const codigo = (cuerpo as any)?.error || 'ERROR_ELIMINANDO';
      throw new Error(this.explicarError(codigo));
    }
  }

  /** Todos los perfiles. Solo administración: lo exige la política. */
  listarUsuarios(): Observable<UsuarioPerfil[]> {
    const consulta = this.supabase
      .from('perfiles')
      .select('*')
      .order('creado_en', { ascending: false });

    return from(consulta).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map((f) => this.aPerfil(f));
      })
    );
  }

  /**
   * Si la persona puede usar las funciones que requieren convenio.
   *
   * Un administrador siempre pasa: si no, no podría revisar ni demostrar
   * la app. Un estudiante pasa solo si su establecimiento tiene el plan
   * activo.
   */
  /**
   * Qué puede ver esta persona dentro de la aplicación.
   *
   * Una institución que todavía no paga solo accede a sus solicitudes y
   * al pago: mostrarle el catálogo y el simulador sería entregarle justo
   * lo que está contratando.
   *
   * Estudiantes y administradores pasan siempre.
   */
  institucionConPlanPendiente(uid: string): Observable<boolean> {
    return this.getUsuario(uid).pipe(
      switchMap((perfil) => {
        if (!perfil) return of(false);
        if (perfil.rol !== 'institucion') return of(false);

        /*
         * La fila de `instituciones` se crea recién al confirmarse el
         * pago, así que no existir equivale a no haber pagado.
         */
        const consulta = this.supabase
          .from('instituciones')
          .select('estado_plan')
          .eq('id', uid)
          .maybeSingle();

        return from(consulta).pipe(
          map(({ data }) => data?.estado_plan !== 'activo')
        );
      })
    );
  }

  tieneAccesoConConvenio(uid: string): Observable<boolean> {
    return this.getUsuario(uid).pipe(
      switchMap((perfil) => {
        if (!perfil) return of(false);
        if (perfil.rol === 'admin') return of(true);

        /*
         * Una cuenta institucional es su propia institución: su fila en
         * `instituciones` se identifica con su mismo uid. El campo
         * `institucionId` es el del estudiante —a qué establecimiento
         * pertenece— y en estas cuentas viene vacío, así que mirarlo
         * dejaba al director fuera de lo que acababa de pagar.
         */
        const idInstitucion =
          perfil.rol === 'institucion' ? uid : perfil.institucionId;

        if (!idInstitucion) return of(false);

        const consulta = this.supabase
          .from('instituciones')
          .select('estado_plan')
          .eq('id', idInstitucion)
          .maybeSingle();

        return from(consulta).pipe(
          map(({ data }) => data?.estado_plan === 'activo')
        );
      })
    );
  }
}
