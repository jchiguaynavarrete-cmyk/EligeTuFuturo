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

      const explicacion: Record<string, string> = {
        NO_PUEDES_BORRARTE:
          'No puedes eliminar tu propia cuenta: quedarías fuera del sistema.',
        ULTIMO_ADMINISTRADOR:
          'Es el último administrador. Si lo eliminas, nadie podría gestionar ' +
          'usuarios, solicitudes ni planes. Crea otro administrador primero.',
        SIN_PERMISO: 'Solo un administrador puede eliminar cuentas.',
        USUARIO_NO_ENCONTRADO: 'Esa cuenta ya no existe.',
      };

      throw new Error(explicacion[codigo] || codigo);
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
  tieneAccesoConConvenio(uid: string): Observable<boolean> {
    return this.getUsuario(uid).pipe(
      switchMap((perfil) => {
        if (!perfil) return of(false);
        if (perfil.rol === 'admin') return of(true);
        if (!perfil.institucionId) return of(false);

        const consulta = this.supabase
          .from('instituciones')
          .select('estado_plan')
          .eq('id', perfil.institucionId)
          .maybeSingle();

        return from(consulta).pipe(
          map(({ data }) => data?.estado_plan === 'activo')
        );
      })
    );
  }
}
