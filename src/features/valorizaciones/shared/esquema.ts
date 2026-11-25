import {
  ACUMULADO_VACIO,
  acumular,
  calcularAdelanto,
  calcularCuota,
  redondear2,
  type Acumulado,
  type CondicionesCalculo,
  type CuotaCalculada,
  type MontosDocumento,
} from './cuota.js';

/**
 * Matriz de pagos de un contrato (plan 12, R-07): el adelanto, las cuotas ya aprobadas tal como se congelaron y las que faltan, proyectadas
 * a partir de lo pendiente. **Puro.** Lo aprobado no se recalcula nunca; lo que falta se reformula solo (si la V1 se aprobó a la mitad,
 * lo pendiente se reparte entre menos cuotas y cada una sube).
 */

export interface CuotaAprobada extends CuotaCalculada {
  id: number;
}

export interface FilaMatriz extends CuotaCalculada {
  /** `APROBADA` = congelada en la BD; `PROYECTADA` = calculada al leer. */
  situacion: 'APROBADA' | 'PROYECTADA';
  id?: number;
}

export interface EntradaMatriz {
  doc: MontosDocumento;
  condiciones: CondicionesCalculo;
  /** Cuotas aprobadas y vigentes, en orden (el adelanto, si está aprobado, trae `numero` 0). */
  aprobadas: readonly CuotaAprobada[];
  /** Hay adelanto en este contrato (adelanto > 0 %). */
  conAdelanto: boolean;
}

/** Acumulado de las cuotas aprobadas. */
export function acumuladoDe(aprobadas: readonly CuotaCalculada[]): Acumulado {
  return aprobadas.reduce<Acumulado>((a, c) => acumular(a, c), ACUMULADO_VACIO);
}

/** Cuántas valorizaciones (sin contar el adelanto) faltan por aprobar. */
export function valorizacionesRestantes(condiciones: CondicionesCalculo, aprobadas: readonly CuotaCalculada[]): number {
  const hechas = aprobadas.filter((c) => c.tipo === 'VALORIZACION').length;
  return Math.max(condiciones.numeroValorizaciones - hechas, 0);
}

/**
 * Proyecta las valorizaciones que faltan repartiendo lo pendiente en partes iguales (la última, por diferencia). Devuelve las filas ya
 * calculadas en orden. `previo` es lo acumulado hasta la última cuota aprobada.
 */
export function proyectarPendientes(doc: MontosDocumento, condiciones: CondicionesCalculo, previo: Acumulado, primeraNumero: number, restantes: number): CuotaCalculada[] {
  const filas: CuotaCalculada[] = [];
  let acumulado = previo;
  for (let i = 0; i < restantes; i++) {
    const quedan = restantes - i;
    const pendiente = Math.max(redondear2(doc.total - acumulado.valorizado), 0);
    const c = calcularCuota(doc, condiciones, acumulado, {
      numero: primeraNumero + i,
      valorizado: quedan > 0 ? redondear2(pendiente / quedan) : pendiente,
      esUltima: quedan === 1,
    });
    filas.push(c);
    acumulado = acumular(acumulado, c);
  }
  return filas;
}

/** El adelanto, las cuotas aprobadas y las que faltan. Si todo está aprobado, no se proyecta nada. */
export function matrizDePagos(e: EntradaMatriz): FilaMatriz[] {
  const filas: FilaMatriz[] = [];
  const aprobadas = [...e.aprobadas].sort((a, b) => a.numero - b.numero);
  const hayAdelantoAprobado = aprobadas.some((c) => c.tipo === 'ADELANTO');
  if (e.conAdelanto && !hayAdelantoAprobado) filas.push({ ...calcularAdelanto(e.doc, e.condiciones), situacion: 'PROYECTADA' });
  for (const c of aprobadas) filas.push({ ...c, situacion: 'APROBADA' });

  const previo = hayAdelantoAprobado || !e.conAdelanto ? acumuladoDe(aprobadas) : acumular(acumuladoDe(aprobadas), calcularAdelanto(e.doc, e.condiciones));
  const restantes = valorizacionesRestantes(e.condiciones, aprobadas);
  const primera = aprobadas.filter((c) => c.tipo === 'VALORIZACION').length + 1;
  for (const c of proyectarPendientes(e.doc, e.condiciones, previo, primera, restantes)) filas.push({ ...c, situacion: 'PROYECTADA' });
  return filas;
}

/** Lo que falta valorizar (bruto) tras las cuotas aprobadas. */
export function pendienteDeValorizar(doc: MontosDocumento, aprobadas: readonly CuotaCalculada[]): number {
  return Math.max(redondear2(doc.total - acumuladoDe(aprobadas).valorizado), 0);
}
