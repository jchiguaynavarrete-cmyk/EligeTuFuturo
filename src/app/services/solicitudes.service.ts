import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';

import { environment } from 'src/environments/environment';
import { SupabaseClientService } from '../core/supabase.client';
import { AuthService } from './auth.service';
import { Institucion, Plan, Solicitud } from '../models/planes.model';

/** Lo que llena la institución en el formulario. Nada más que esto. */
export interface DatosSolicitud {
  nombreInstitucion: string;
  rbd: string;
  encargado: string;
  correo: string;
  telefono: string;
  cantidadEstudiantes: number;
}


/** Lo que devuelve el backend al habilitar una cuenta institucional. */
export interface CredencialesInstitucion {
  correo: string;
  /** Solo viene si la cuenta se acaba de crear. */
  passwordTemporal: string | null;
  cuentaNueva: boolean;
}

@Injectable({ providedIn: 'root' })
export class SolicitudesService {
  private supabase = inject(SupabaseClientService).cliente;
  private authService = inject(AuthService);

  /** Traduce una fila a la forma que usan las páginas. */
  private aSolicitud(f: any): Solicitud {
    return {
      id: f.id,
      nombreInstitucion: f.nombre_institucion,
      rbd: f.rbd ?? '',
      encargado: f.encargado,
      cargo: f.cargo ?? undefined,
      correo: f.correo,
      telefono: f.telefono ?? '',
      cantidadEstudiantes: f.cantidad_estudiantes,
      planId: f.plan_id,
      planNombre: f.plan_nombre,
      uidSolicitante: f.solicitante_id,
      origen: f.origen,
      estado: f.estado,
      fechaSolicitud: f.fecha_solicitud,
      fechaResolucion: f.fecha_resolucion,
      adminUid: f.admin_id,
      motivoRechazo: f.motivo_rechazo,
      monto: f.monto,
      estadoPago: f.estado_pago,
      pagoId: f.pago_id,
    } as Solicitud;
  }

  private aInstitucion(f: any): Institucion {
    return {
      uid: f.id,
      nombreInstitucion: f.nombre_institucion,
      rbd: f.rbd ?? '',
      correo: f.correo ?? '',
      planId: f.plan_id,
      planNombre: f.plan_nombre,
      estadoPlan: f.estado_plan,
      solicitudId: f.solicitud_id,
      fechaInicio: f.fecha_inicio,
      fechaTermino: f.fecha_termino,
    } as Institucion;
  }

  /**
   * Crea la solicitud en estado pendiente.
   *
   * El monto y el estado los fija después el administrador: aquí van con
   * valores neutros a propósito, y la política de la tabla lo exige, así
   * que nadie puede llegar con su solicitud ya aprobada.
   */
  async crearSolicitud(uid: string, plan: Plan, datos: DatosSolicitud): Promise<string> {
    const { data, error } = await this.supabase
      .from('solicitudes')
      .insert({
        nombre_institucion: datos.nombreInstitucion.trim(),
        rbd: datos.rbd.trim(),
        encargado: datos.encargado.trim(),
        correo: datos.correo.trim().toLowerCase(),
        telefono: datos.telefono.trim(),
        cantidad_estudiantes: datos.cantidadEstudiantes,

        plan_id: plan.id,
        plan_nombre: plan.nombre,

        solicitante_id: uid,
        origen: 'app',

        estado: 'pendiente',
        monto: null,
        estado_pago: plan.requierePago ? 'pendiente' : 'no_aplica',
        pago_id: null,
        admin_id: null,
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  }

  listarMisSolicitudes(uid: string): Observable<Solicitud[]> {
    const consulta = this.supabase
      .from('solicitudes')
      .select('*')
      .eq('solicitante_id', uid)
      .order('fecha_solicitud', { ascending: false });

    return from(consulta).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map((f) => this.aSolicitud(f));
      })
    );
  }

  /** Todas. Solo administración: lo exige la política. */
  listarTodas(): Observable<Solicitud[]> {
    const consulta = this.supabase
      .from('solicitudes')
      .select('*')
      .order('fecha_solicitud', { ascending: false });

    return from(consulta).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map((f) => this.aSolicitud(f));
      })
    );
  }

  getSolicitud(id: string): Observable<Solicitud | null> {
    const consulta = this.supabase
      .from('solicitudes')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    return from(consulta).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data ? this.aSolicitud(data) : null;
      })
    );
  }

  /**
   * Aprueba y fija el monto a pagar.
   *
   * Si el plan no requiere pago (Piloto), se activa de inmediato: esa
   * decisión viene de la configuración del plan, no de cada pantalla.
   */
  /**
   * Comprueba que la actualización haya tocado alguna fila.
   *
   * Cuando las políticas de seguridad bloquean un cambio, la base NO
   * devuelve error: responde que todo salió bien y no modifica nada.
   * Sin esta comprobación la pantalla anunciaría "aprobada" mientras la
   * solicitud sigue pendiente, que es justo lo que no debe pasar.
   */
  private exigirQueCambiara(filas: unknown[] | null): void {
    if (!filas || filas.length === 0) {
      throw new Error(
        'La base no aplicó el cambio. Lo más probable es que la sesión ' +
          'haya perdido el permiso de administrador: cierra sesión y vuelve a entrar.'
      );
    }
  }

  /**
   * Crea o habilita la cuenta de la institución para que pueda entrar.
   *
   * Va por el backend porque el rol de institución no se puede
   * auto-asignar: la base crea a todos como estudiante a propósito, y
   * cambiar eso exige la llave de servicio, que nunca viaja al navegador.
   *
   * Devuelve la clave temporal solo si la cuenta se acaba de crear.
   */
  async habilitarCuenta(solicitudId: string): Promise<CredencialesInstitucion> {
    const token = await this.authService.getToken();
    if (!token) throw new Error('SIN_SESION');

    const r = await fetch(`${environment.apiPagosUrl}/solicitudes/habilitar-cuenta`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ solicitudId }),
    });

    const cuerpo = await r.json().catch(() => ({}));

    if (!r.ok) {
      const codigo = (cuerpo as any)?.error || 'ERROR_HABILITANDO_CUENTA';

      const explicacion: Record<string, string> = {
        SOLICITUD_SIN_CORREO:
          'La solicitud no trae correo, así que no hay a quién crearle la cuenta.',
        SIN_PERMISO: 'Solo un administrador puede habilitar cuentas.',
      };

      throw new Error(explicacion[codigo] || codigo);
    }

    return cuerpo as CredencialesInstitucion;
  }

  async aprobarSolicitud(
    solicitudId: string,
    adminUid: string,
    monto: number,
    plan: Plan
  ): Promise<void> {
    const { data, error } = await this.supabase
      .from('solicitudes')
      .update({
        estado: 'aprobada',
        monto: plan.requierePago ? monto : 0,
        estado_pago: plan.requierePago ? 'pendiente' : 'no_aplica',
        fecha_resolucion: new Date().toISOString(),
        admin_id: adminUid,
        motivo_rechazo: null,
      })
      .eq('id', solicitudId)
      .select('id');

    if (error) throw error;
    this.exigirQueCambiara(data);

    if (!plan.requierePago) {
      await this.activarPlan(solicitudId, plan);
    }
  }

  async rechazarSolicitud(solicitudId: string, adminUid: string, motivo: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('solicitudes')
      .update({
        estado: 'rechazada',
        fecha_resolucion: new Date().toISOString(),
        admin_id: adminUid,
        motivo_rechazo: motivo.trim() || null,
      })
      .eq('id', solicitudId)
      .select('id');

    if (error) throw error;
    this.exigirQueCambiara(data);
  }

  /**
   * Deja el plan vigente. Se usa para el Plan Piloto, que es gratuito.
   *
   * Va por el backend porque la tabla `instituciones` no acepta
   * escrituras desde el navegador: el plan de una institución no debe
   * depender de lo que diga el cliente.
   */
  async activarPlan(solicitudId: string, plan: Plan): Promise<void> {
    const token = await this.authService.getToken();
    if (!token) throw new Error('SIN_SESION');

    const r = await fetch(`${environment.apiPagosUrl}/solicitudes/activar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ solicitudId, planId: plan.id }),
    });

    if (!r.ok) {
      const cuerpo = await r.json().catch(() => ({}));
      const codigo = (cuerpo as any)?.error || 'ERROR_ACTIVANDO';

      const explicacion: Record<string, string> = {
        SOLICITUD_SIN_DUENO:
          'Esta solicitud llegó por el formulario público y todavía no ' +
          'tiene cuenta asociada. La institución debe crear su cuenta con ' +
          'ese mismo correo e iniciar sesión; recién entonces se le puede ' +
          'activar el plan.',
        SOLICITUD_NO_APROBADA: 'La solicitud no está aprobada.',
        PLAN_REQUIERE_PAGO: 'Este plan se activa al confirmarse el pago.',
      };

      throw new Error(explicacion[codigo] || codigo);
    }
  }

  getInstitucion(uid: string): Observable<Institucion | null> {
    const consulta = this.supabase
      .from('instituciones')
      .select('*')
      .eq('id', uid)
      .maybeSingle();

    return from(consulta).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data ? this.aInstitucion(data) : null;
      })
    );
  }

  /**
   * Pide al backend que enlace a esta cuenta las solicitudes que llegaron
   * por el formulario público con el mismo correo.
   *
   * Va por el backend porque el correo se toma del token verificado: si
   * viniera del navegador, cualquiera podría reclamar las solicitudes de
   * otra institución.
   */
  async reclamarSolicitudesPublicas(): Promise<number> {
    const token = await this.authService.getToken();
    if (!token) return 0;

    try {
      const r = await fetch(`${environment.apiPagosUrl}/solicitudes/reclamar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!r.ok) return 0;
      const datos = await r.json();
      return datos?.enlazadas ?? 0;
    } catch {
      // Sin backend el panel igual funciona: solo no enlaza.
      return 0;
    }
  }
}
