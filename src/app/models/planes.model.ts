/**
 * Marca de tiempo. PostgreSQL las entrega como texto ISO; se mantiene
 * `Date` para los valores que la app arma en memoria.
 */
export type Timestamp = string | Date;

/**
 * Identificadores de los planes. Coinciden con el id del documento en la base.
 * 'redEducativa' ya no se ofrece: se mantiene solo para leer solicitudes antiguas.
 */
export type PlanId =
  | 'escolar'
  | 'comunal'
  | 'territorial'
  | 'piloto'
  | 'nacional'
  | 'redEducativa';

/**
 * 'pagado': licencia anual con precio fijo (Escolar, Comunal, Territorial).
 * 'complementario': no genera ingresos proyectados (Piloto, Convenio Nacional).
 */
export type CategoriaPlan = 'pagado' | 'complementario';

export type EstadoSolicitud = 'pendiente' | 'aprobada' | 'rechazada';

export type EstadoPago = 'no_aplica' | 'pendiente' | 'pagado' | 'fallido';

export type EstadoTransaccion =
  | 'iniciado'
  | 'autorizado'
  | 'rechazado'
  | 'cancelado'
  | 'error';

export type EstadoPlanInstitucion = 'inactivo' | 'activo' | 'vencido';

/**
 * Plan comercial. Vive en `planes/{id}` para que los precios y textos se
 * administren desde la base y no queden escritos en el frontend.
 */
export interface Plan {
  id: PlanId;
  nombre: string;
  descripcion: string;
  caracteristicas: string[];
  textoBoton: string;

  /**
   * Precio anual neto (sin IVA) del primer año, en CLP.
   * null cuando el plan no tiene costo o se valoriza por convenio.
   */
  precio: number | null;

  /** Si es false, al aprobarse se activa sin pasar por Webpay (Plan Piloto). */
  requierePago: boolean;

  /** Si es true, el precio lo define el administrador caso a caso. */
  requiereCotizacion: boolean;

  /** Duración del plan una vez activado. */
  duracionMeses: number;

  /** Marca "Recomendado" en la tarjeta. */
  destacado: boolean;

  /**
   * Máximo de establecimientos que cubre el plan; null si lo define un convenio.
   * Los campos opcionales pueden faltar en planes creados antes de esta versión.
   */
  establecimientos?: number | null;

  /** Texto corto de cobertura, por ejemplo "Hasta 5 establecimientos". */
  cobertura?: string;

  /** Cliente al que apunta el plan, por ejemplo "Municipalidades y corporaciones". */
  idealPara?: string;

  categoria?: CategoriaPlan;

  activo: boolean;
  orden: number;
}

/**
 * Solicitud de una institución para contratar un plan.
 * Los campos que definen dinero o estado los escribe el administrador o el
 * backend, nunca el formulario público.
 */
export interface Solicitud {
  id: string;

  // Datos del formulario
  nombreInstitucion: string;
  rbd: string;
  encargado: string;
  correo: string;
  telefono: string;
  cantidadEstudiantes: number;

  // Plan pedido
  planId: PlanId;
  planNombre: string;

  // Quién la envió. Las que llegan por el formulario público nacen sin
  // dueño: se enlazan a la cuenta cuando esa persona se registra.
  uidSolicitante: string | null;

  /** De dónde vino: la app con sesión, o la landing pública. */
  origen: 'app' | 'publico';

  /** Cargo del encargado. Solo lo pide el formulario público. */
  cargo?: string;

  // Flujo administrativo
  estado: EstadoSolicitud;
  fechaSolicitud: Timestamp | null;
  fechaResolucion: Timestamp | null;
  adminUid: string | null;
  motivoRechazo: string | null;

  // Dinero: lo fija el administrador al aprobar
  monto: number | null;
  estadoPago: EstadoPago;

  /** Id del pago autorizado, cuando existe. Evita cobrar dos veces. */
  pagoId: string | null;
}

/** Registro de un intento de pago con Webpay. Lo escribe solo el backend. */
export interface Pago {
  id: string;
  solicitudId: string;
  uidSolicitante: string;

  buyOrder: string;
  sessionId: string;
  amount: number;
  token: string | null;

  estado: EstadoTransaccion;

  // Datos que devuelve Transbank al confirmar
  authorizationCode: string | null;
  paymentTypeCode: string | null;
  responseCode: number | null;
  transactionDate: string | null;

  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

/** Plan vigente de una institución. Vive en `instituciones/{uid}`. */
export interface Institucion {
  uid: string;
  nombreInstitucion: string;
  rbd: string;
  correo: string;

  planId: PlanId | null;
  planNombre: string | null;
  estadoPlan: EstadoPlanInstitucion;

  solicitudId: string | null;
  fechaInicio: Timestamp | null;
  fechaTermino: Timestamp | null;
}

/** Textos y color de cada estado, para no repetirlos en cada plantilla. */
export const ESTADO_SOLICITUD_META: Record<
  EstadoSolicitud,
  { texto: string; color: string }
> = {
  pendiente: { texto: 'Pendiente', color: 'warning' },
  aprobada: { texto: 'Aprobada', color: 'success' },
  rechazada: { texto: 'Rechazada', color: 'danger' },
};

export const ESTADO_PAGO_META: Record<EstadoPago, { texto: string; color: string }> = {
  no_aplica: { texto: 'Sin pago', color: 'medium' },
  pendiente: { texto: 'Pago pendiente', color: 'warning' },
  pagado: { texto: 'Pagado', color: 'success' },
  fallido: { texto: 'Pago fallido', color: 'danger' },
};
