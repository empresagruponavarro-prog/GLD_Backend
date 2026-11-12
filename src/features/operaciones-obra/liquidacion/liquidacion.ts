import { ejecucionCompleta, type AvanceDeObra } from '../shared/avance-obra.js';
import type { ResumenPlanos } from '../planos-requeridos/planos-requeridos.js';

/**
 * Liquidación de la obra (GRP S-11, DG6): el centro de costo pasa de `POR LIQUIDAR` a `CERRADO` y la obra queda liquidada.
 * Requiere haber completado la ejecución (100 %), la fecha de fin real y todos los planos obligatorios.
 */
export const ESTADO_POR_LIQUIDAR = 'POR LIQUIDAR';
export const ESTADO_CERRADO = 'CERRADO';

export type CodigoRequisito = 'ESTADO' | 'AVANCE' | 'FIN_REAL' | 'PLANOS';

export interface Requisito {
  codigo: CodigoRequisito;
  cumplido: boolean;
  mensaje: string;
}

export interface EntradaLiquidacion {
  estadoCc: string | null;
  fechaFinReal: string | null;
  avance: AvanceDeObra;
  planos: ResumenPlanos;
}

export interface SituacionLiquidacion {
  /** El centro de costo ya está cerrado. */
  liquidada: boolean;
  puedeLiquidar: boolean;
  requisitos: Requisito[];
}

export function evaluarLiquidacion(e: EntradaLiquidacion): SituacionLiquidacion {
  const liquidada = e.estadoCc === ESTADO_CERRADO;
  const avanceOk = ejecucionCompleta(e.avance);
  const requisitos: Requisito[] = [
    {
      codigo: 'ESTADO',
      cumplido: e.estadoCc === ESTADO_POR_LIQUIDAR || liquidada,
      mensaje: e.estadoCc === ESTADO_POR_LIQUIDAR || liquidada ? 'El centro de costo está en liquidación' : 'Pase el centro de costo al estado POR LIQUIDAR',
    },
    {
      codigo: 'AVANCE',
      cumplido: avanceOk,
      mensaje: !e.avance.configurada
        ? 'La obra no está en el control de avance: no se exige un avance'
        : avanceOk
          ? 'La ejecución está completa (100 %)'
          : `La obra está al ${Math.floor(e.avance.real)} % de avance: falta completar la ejecución`,
    },
    {
      codigo: 'FIN_REAL',
      cumplido: e.fechaFinReal !== null,
      mensaje: e.fechaFinReal !== null ? `Fin real: ${e.fechaFinReal}` : 'Registre la fecha de fin real',
    },
    {
      codigo: 'PLANOS',
      cumplido: e.planos.completo,
      mensaje: e.planos.completo
        ? 'Están todos los planos obligatorios'
        : `Faltan ${e.planos.faltantes.length} plano(s) obligatorio(s): ${e.planos.faltantes.map((f) => `${f.codigo} ${f.nombre}`).join(', ')}`,
    },
  ];
  return { liquidada, puedeLiquidar: !liquidada && requisitos.every((r) => r.cumplido), requisitos };
}
