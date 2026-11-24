import { ConflictException, NotFoundException } from '@nestjs/common';
import type { AlmacenSql, Tx } from '../../almacen/shared/almacen-sql.js';
import { avanceDeLinea, avancesPorSubfase, subfasesDeLineas } from '../../operaciones-obra/shared/avances-subfase.js';
import type { OrmObra } from '../../operaciones-obra/shared/control-avance/orm.js';
import {
  acumular,
  calcularAdelanto,
  calcularCuota,
  netoSinDescuentos,
  redondear2,
  repartirDeductivos,
  sugerirValorizado,
  type Acumulado,
  type AplicacionDeductivo,
  type CondicionesCalculo,
  type CuotaCalculada,
  type MontosDocumento,
} from './cuota.js';
import { acumuladoDe } from './esquema.js';
import { avancePonderado, valorizarLineas, type LineaOrden, type LineaValorizada } from './lineas.js';
import {
  aprobadasDelEsquema,
  leerContrato,
  leerCuotas,
  leerDeductivos,
  leerDocumento,
  leerLineasOrden,
  montosAnterioresPorLinea,
  montosDe,
  type ContratoFila,
  type CuotaFila,
  type DocContrato,
} from './datos.js';

/**
 * Cálculo de **la próxima valorización** de un contrato (plan 12): une el motor puro con lo que hay en la BD (avance de obra al corte, líneas de
 * la orden, lo valorizado antes y los deductivos pendientes). No escribe nada: sirve para el borrador, la bandeja de la semana y la aprobación.
 */

export interface ContextoCalculo {
  sql: AlmacenSql;
  orm: OrmObra;
  tx?: Tx;
}

export interface EntradaCalculo {
  idContrato: number;
  /** Corte del avance: `YYYY-MM-DD`. */
  corte: string;
  /** Monto bruto elegido por el supervisor; sin él se propone el sugerido. */
  valorizado?: number;
  /** Avance acumulado escrito a mano por línea (`ordenCompraDetalle.id` → %), cuando la obra no lo informa. */
  avancesManuales?: ReadonlyMap<number, number>;
  /** Deductivos que se descuentan; sin él, todos los pendientes. */
  deductivoIds?: readonly number[];
}

export interface LineaCalculada extends LineaValorizada {
  descripcion: string | null;
  codigo: string | null;
  unidad: string | null;
  subfase: string | null;
  /** Monto de la línea en la orden (sin IGV). */
  monto: number;
  /** Avance que informa la obra (sin la corrección manual). */
  avanceObra: number | null;
}

export type OrigenMonto = 'PLAN' | 'AVANCE' | 'SUPERVISOR';

export interface ResultadoCalculo {
  contrato: ContratoFila;
  doc: DocContrato;
  montos: MontosDocumento;
  condiciones: CondicionesCalculo;
  numero: number;
  esUltima: boolean;
  restantes: number;
  pendiente: number;
  plan: number;
  sugerido: number;
  /** Avance ponderado de la orden al corte; `null` si ninguna línea tiene dato. */
  avancePct: number | null;
  origen: OrigenMonto;
  valorizado: number;
  cuota: CuotaCalculada;
  lineas: LineaCalculada[];
  aplicaciones: AplicacionDeductivo[];
  /** Hay partidas sin avance (ni de la obra ni escrito a mano): no se puede aprobar. */
  faltaAvance: boolean;
  alertas: string[];
  /** Cuotas aprobadas del esquema (adelanto y valorizaciones). */
  aprobadas: CuotaFila[];
}

export const condicionesDe = (c: ContratoFila): CondicionesCalculo => ({
  adelantoPct: c.adelanto_porcentaje,
  garantiaPct: c.garantia_porcentaje,
  numeroValorizaciones: c.numero_valorizaciones,
});

const acotar = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Acumulado de lo aprobado más, si el adelanto todavía no está aprobado, el adelanto proyectado (para repartir bien los tributos). */
export function previoConAdelanto(doc: MontosDocumento, cond: CondicionesCalculo, aprobadas: readonly CuotaFila[]): Acumulado {
  const previo = acumuladoDe(aprobadas);
  const hayAdelanto = aprobadas.some((c) => c.tipoBD === 'ADELANTO');
  return cond.adelantoPct > 0 && !hayAdelanto ? acumular(previo, calcularAdelanto(doc, cond)) : previo;
}

export async function calcularValorizacion(ctx: ContextoCalculo, e: EntradaCalculo): Promise<ResultadoCalculo> {
  const { sql, orm, tx } = ctx;
  const contrato = await leerContrato(sql, e.idContrato, tx);
  if (!contrato || contrato.estado === 'ANULADO') throw new NotFoundException(`Contrato ${e.idContrato} no encontrado`);
  const doc = await leerDocumento(sql, contrato.id_documento_origen, tx);
  if (!doc) throw new NotFoundException(`La orden del contrato ${e.idContrato} no existe`);
  const montos = montosDe(doc);
  const condiciones = condicionesDe(contrato);

  const aprobadas = aprobadasDelEsquema(await leerCuotas(sql, contrato.id, tx));
  const hechas = aprobadas.filter((c) => c.tipoBD === 'VALORIZACION').length;
  const restantes = contrato.numero_valorizaciones - hechas;
  if (restantes <= 0) throw new ConflictException('Todas las valorizaciones del contrato ya se aprobaron');
  const previo = previoConAdelanto(montos, condiciones, aprobadas);
  const pendiente = Math.max(redondear2(montos.total - previo.valorizado), 0);
  if (pendiente <= 0.005) throw new ConflictException('No queda nada por valorizar en este contrato');
  const numero = hechas + 1;
  const esUltima = restantes === 1;

  // Líneas y avance al corte: la obra manda; si no tiene la partida, vale lo escrito a mano.
  const lineasOrden = await leerLineasOrden(sql, doc.id, tx);
  const anteriores = await montosAnterioresPorLinea(sql, contrato.id, tx);
  const avancesObra = doc.id_centro_costo === null ? new Map<number, number>() : await avancesPorSubfase(orm, doc.id_centro_costo, e.corte);
  const equivalentes = await subfasesDeLineas(sql, lineasOrden.map((l) => l.id), tx);
  const avanceObra = new Map(lineasOrden.map((l) => [l.id, avanceDeLinea(l.id_subfase, equivalentes.get(l.id) ?? [], avancesObra)] as const));
  const entradaLineas: LineaOrden[] = lineasOrden.map((l) => {
    const manual = e.avancesManuales?.get(l.id);
    return { id: l.id, monto: l.monto, avancePct: manual ?? avanceObra.get(l.id) ?? null, manual: manual !== undefined, montoAnterior: anteriores.get(l.id) ?? 0 };
  });
  const avancePct = avancePonderado(entradaLineas);
  const faltaAvance = entradaLineas.some((l) => l.avancePct === null);

  // Monto de la cuota: el plan es el máximo y el avance lo limita; el supervisor puede poner otro (con motivo, al aprobar).
  const plan = esUltima ? pendiente : redondear2(pendiente / restantes);
  const sugerido = esUltima ? pendiente : sugerirValorizado({ total: montos.total, valorizado: previo.valorizado, restantes, avancePct });
  const limitadoPorAvance = !esUltima && sugerido < plan - 0.005;
  let valorizado: number;
  let origen: OrigenMonto;
  if (esUltima) {
    valorizado = pendiente;
    origen = 'PLAN';
  } else if (e.valorizado === undefined) {
    valorizado = sugerido;
    origen = limitadoPorAvance ? 'AVANCE' : 'PLAN';
  } else {
    valorizado = acotar(redondear2(e.valorizado), 0, pendiente);
    origen = Math.abs(valorizado - sugerido) > 0.005 ? 'SUPERVISOR' : limitadoPorAvance ? 'AVANCE' : 'PLAN';
  }

  // Descuentos: los deductivos pendientes caben hasta el neto de la cuota (nunca queda negativa).
  const todos = await leerDeductivos(sql, doc.id, tx);
  let pendientes = todos.filter((d) => d.estado === 'PENDIENTE' && d.pendiente > 0.005);
  if (e.deductivoIds) pendientes = pendientes.filter((d) => e.deductivoIds!.includes(d.id));
  const sinDescuentos = calcularCuota(montos, condiciones, previo, { numero, valorizado, esUltima, descuentos: 0 });
  const reparto = repartirDeductivos(netoSinDescuentos(sinDescuentos), pendientes.map((d) => ({ id: d.id, pendiente: d.pendiente })));
  const cuota = calcularCuota(montos, condiciones, previo, { numero, valorizado, esUltima, descuentos: reparto.total });

  const repartidas = valorizarLineas(entradaLineas, cuota.valorizado, montos.total);
  const lineas = repartidas.map<LineaCalculada>((l, i) => ({
    ...l,
    descripcion: lineasOrden[i].descripcion,
    codigo: lineasOrden[i].codigo,
    unidad: lineasOrden[i].unidad,
    subfase: lineasOrden[i].subfase,
    monto: lineasOrden[i].monto,
    avanceObra: avanceObra.get(lineasOrden[i].id) ?? null,
  }));

  const alertas: string[] = [];
  if (faltaAvance) alertas.push('Hay partidas sin avance de la obra: escriba su avance para poder aprobar.');
  if (esUltima && (avancePct === null || avancePct < 99.5)) alertas.push('Es la última cuota: toma todo lo pendiente, pero la obra no está al 100 %. Para aprobarla hace falta el motivo.');
  if (origen === 'SUPERVISOR') alertas.push('El monto es distinto del sugerido: para aprobarlo hace falta el motivo.');
  if (reparto.total > 0 && reparto.aplicaciones.length < pendientes.length) alertas.push('Hay descuentos que no caben en esta cuota: el resto queda pendiente para la siguiente.');

  return {
    contrato,
    doc,
    montos,
    condiciones,
    numero,
    esUltima,
    restantes,
    pendiente,
    plan,
    sugerido,
    avancePct,
    origen,
    valorizado: cuota.valorizado,
    cuota,
    lineas,
    aplicaciones: reparto.aplicaciones,
    faltaAvance,
    alertas,
    aprobadas,
  };
}
