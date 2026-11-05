/**
 * Estado normalizado del presupuesto (GRP, DG1). `ppto_Principal.Estado` (texto libre) queda como espejo legado
 * para las pantallas que todavía lo leen; la fuente de verdad es `estado_ppto`.
 */
export const ESTADOS_PPTO = ['EN_DESARROLLO', 'EN_REVISION', 'OBSERVADO', 'APROBADO', 'ENTREGADO', 'LIQUIDADO', 'ANULADO'] as const;
export type EstadoPpto = (typeof ESTADOS_PPTO)[number];

/** Estados posteriores a la aprobación: la estructura de la obra ya se capturó y no se vuelve a capturar. */
export const ESTADOS_APROBADOS: readonly EstadoPpto[] = ['APROBADO', 'ENTREGADO', 'LIQUIDADO'];

/** Estados en los que el presupuesto todavía se puede completar, limpiar y aprobar. */
export const ESTADOS_EDITABLES: readonly EstadoPpto[] = ['EN_DESARROLLO', 'EN_REVISION', 'OBSERVADO'];

export function esAprobado(estado: string | null | undefined): boolean {
  return ESTADOS_APROBADOS.includes(estado as EstadoPpto);
}

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Lleva el `Estado` en texto libre (histórico o enviado por el cliente) al estado normalizado. */
export function estadoPptoDeTexto(texto: string | null | undefined): EstadoPpto {
  const clave = sinAcentos((texto ?? '').replace(/_/g, ' ')).trim().replace(/\s+/g, ' ').toUpperCase();
  switch (clave) {
    case 'APROBADO':
      return 'APROBADO';
    case 'EN REVISION':
    case 'REVISION':
      return 'EN_REVISION';
    case 'OBSERVADO':
    case 'RECHAZADO':
      return 'OBSERVADO';
    case 'ENTREGADO':
      return 'ENTREGADO';
    case 'LIQUIDADO':
      return 'LIQUIDADO';
    case 'ANULADO':
      return 'ANULADO';
    default:
      return 'EN_DESARROLLO';
  }
}

const TEXTO_LEGADO: Record<EstadoPpto, string> = {
  EN_DESARROLLO: 'PENDIENTE',
  EN_REVISION: 'En_Revision',
  OBSERVADO: 'Observado',
  APROBADO: 'Aprobado',
  ENTREGADO: 'Entregado',
  LIQUIDADO: 'Liquidado',
  ANULADO: 'Anulado',
};

/** Valor que se escribe en el `Estado` legado de `ppto_Principal`. */
export function textoLegado(estado: EstadoPpto): string {
  return TEXTO_LEGADO[estado];
}

const TEXTO_ESTADO_CC: Record<EstadoPpto, string> = {
  EN_DESARROLLO: 'En_Desarrollo',
  EN_REVISION: 'En_Revision',
  OBSERVADO: 'Observado',
  APROBADO: 'Aprobado',
  ENTREGADO: 'Entregado',
  LIQUIDADO: 'Liquidado',
  ANULADO: 'Anulado',
};

/** Valor que se escribe en `CentroCostos.presupuesto_estado` (mismo formato que ya tienen los datos). */
export function textoEstadoCc(estado: EstadoPpto): string {
  return TEXTO_ESTADO_CC[estado];
}

const RANGO: Record<EstadoPpto, number> = {
  ANULADO: -1,
  EN_DESARROLLO: 0,
  OBSERVADO: 1,
  EN_REVISION: 2,
  APROBADO: 3,
  ENTREGADO: 4,
  LIQUIDADO: 5,
};

/** El estado más avanzado de una lista (ignora los anulados); `null` si no queda ninguno. */
export function estadoMasAvanzado(estados: readonly EstadoPpto[]): EstadoPpto | null {
  let mejor: EstadoPpto | null = null;
  for (const e of estados) {
    if (e === 'ANULADO') continue;
    if (mejor === null || RANGO[e] > RANGO[mejor]) mejor = e;
  }
  return mejor;
}

/** ¿El presupuesto es un adicional? (`TipoPpto` o, en datos antiguos, el concepto). */
export function esAdicional(tipoPpto: string | null | undefined, concepto?: string | null): boolean {
  return (tipoPpto ?? '').toUpperCase().includes('ADICIONAL') || (!tipoPpto && (concepto ?? '').toUpperCase().includes('ADICIONAL'));
}
