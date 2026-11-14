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
  async aprobarSolicitud(
    solicitudId: string,
    adminUid: string,
    monto: number,
    plan: Plan
  ): Promise<void> {
    const { error } = await this.supabase
      .from('solicitudes')
      .update({
        estado: 'aprobada',
        monto: plan.requierePago ? monto : 0,
        estado_pago: plan.requierePago ? 'pendiente' : 'no_aplica',
        fecha_resolucion: new Date().toISOString(),
        admin_id: adminUid,
        motivo_rechazo: null,
      })
      .eq('id', solicitudId);

    if (error) throw error;

    if (!plan.requierePago) {
      await this.activarPlan(solicitudId, plan);
    }
  }

  async rechazarSolicitud(solicitudId: string, adminUid: string, motivo: string): Promise<void> {
    const { error } = await this.supabase
      .from('solicitudes')
      .update({
        estado: 'rechazada',
        fecha_resolucion: new Date().toISOString(),
        admin_id: adminUid,
        motivo_rechazo: motivo.trim() || null,
      })
      .eq('id', solicitudId);

    if (error) throw error;
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
      throw new Error((cuerpo as any)?.error || 'ERROR_ACTIVANDO');
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
