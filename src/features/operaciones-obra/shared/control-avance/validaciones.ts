import { aDia } from './calendario.js';
import { tieneAvance } from './avance.js';
import { SEMANAS_META, type AvisoCarga, type Dia, type ObraEntrada } from './control-avance.types.js';
import { metasEfectivas } from './metas.js';

/**
 * Avisos de lectura (RV-09 … RV-22). Los errores de escritura (RV-01 a RV-07, RV-23) no están
 * aquí: se rechazan con `400` al guardar. Un aviso no impide cargar la obra; se muestra como
 * «⚠ N avisos».
 */

export interface ContextoAvisos {
  hoy: Dia;
  /** Lunes de la semana 1. */
  w1: Dia;
  /** Real de la obra (0-100) y si no tiene ningún avance reportado. */
  real: number;
  sinAvance: boolean;
}

const nombreSub = (partida: string, sub: string) => (partida === sub ? sub : `${partida} › ${sub}`);

export function avisosCarga(obra: ObraEntrada, ctx: ContextoAvisos): AvisoCarga[] {
  const avisos: AvisoCarga[] = [];
  const inicio = aDia(obra.inicio);
  const fin = aDia(obra.fin);
  const limite10Semanas = ctx.w1 + 69;
  const iniciada = inicio <= ctx.hoy;
  const enEjecucion = obra.estado === 'EN_EJECUCION' || obra.estado === 'PROXIMO';
  const obraAviso = (codigo: string, mensaje: string) => avisos.push({ codigo, ambito: 'obra', mensaje });

  // Por subpartida
  for (const p of obra.partidas) {
    for (const s of p.subpartidas) {
      const aviso = (codigo: string, mensaje: string) =>
        avisos.push({ codigo, ambito: 'subpartida', item: s.item, mensaje: `${nombreSub(p.nombre, s.nombre)}: ${mensaje}` });
      const sInicio = aDia(s.inicio);
      const sFin = aDia(s.fin);

      const avance = s.avance ?? [];
      if (avance.some((v) => typeof v === 'number' && v > 0 && v < 1)) aviso('RV-09', 'avance menor a 1: escribe 50, no 50%');
      const futura = avance.findIndex((v, i) => typeof v === 'number' && ctx.w1 + 7 * i > ctx.hoy);
      if (futura >= 0) aviso('RV-10', `avance en semana que aún no llega (semana ${futura + 1})`);

      const fuera = sFin > limite10Semanas || sInicio < inicio;
      if (fuera) aviso('RV-13', 'fuera de las 10 semanas de la obra');
      else {
        const metas = metasEfectivas({ inicio: sInicio, fin: sFin }, ctx.w1, s.metas);
        if (Math.abs(metas.slice(0, SEMANAS_META).reduce((a, v) => a + v, 0) - 100) > 0.5) aviso('RV-12', 'la meta no suma 100%');
      }
    }
  }

  // Ítems repetidos (partidas y subpartidas comparten numeración)
  const cuenta = new Map<string, number>();
  for (const p of obra.partidas) {
    cuenta.set(p.item, (cuenta.get(p.item) ?? 0) + 1);
    for (const s of p.subpartidas) if (s.item !== p.item) cuenta.set(s.item, (cuenta.get(s.item) ?? 0) + 1);
  }
  for (const [item, n] of cuenta) if (n > 1) avisos.push({ codigo: 'RV-11', ambito: 'obra', item, mensaje: `ítem ${item} repetido` });

  // Por obra
  if (fin > limite10Semanas) obraAviso('RV-14', 'la obra supera 10 semanas: el avance solo se registra hasta la semana 10');
  if (obra.fechaActualizacion) {
    const fa = aDia(obra.fechaActualizacion);
    if (fa > ctx.hoy) obraAviso('RV-15', `la fecha de actualización (${obra.fechaActualizacion}) es posterior a hoy`);
    else if (enEjecucion && iniciada && ctx.hoy - fa > 14) obraAviso('RV-16', `sin actualizar desde el ${obra.fechaActualizacion}`);
  }
  if ((obra.estado === 'POST_VENTA' || obra.estado === 'CULMINADO') && Math.floor(ctx.real + 1e-9) < 100) {
    obraAviso('RV-17', 'entregada sin el 100% de avance');
  }
  if (obra.entregaReal && enEjecucion) obraAviso('RV-18', 'tiene fecha de entrega: cambia el estado a Post venta');
  if (obra.estado === 'POST_VENTA' && !obra.entregaReal) obraAviso('RV-19', 'sin fecha de entrega real: la post venta se cuenta desde la fecha de fin');
  if (obra.entregaReal && obra.cierrePostVenta && aDia(obra.cierrePostVenta) < aDia(obra.entregaReal)) {
    obraAviso('RV-20', 'el cierre de post venta es anterior a la entrega: se ignora');
  }
  if (obra.estado === 'PROXIMO' && iniciada) obraAviso('RV-21', 'ya inició: sale «En ejecución» (cambia su estado en la ficha)');
  else if (obra.estado === 'EN_EJECUCION' && iniciada && ctx.sinAvance) obraAviso('RV-22', 'sin % de avance: sale con punto gris');

  return avisos;
}

/** ¿La obra tiene algún avance escrito en alguna subpartida? */
export function obraTieneAvance(obra: ObraEntrada): boolean {
  return obra.partidas.some((p) => p.subpartidas.some((s) => tieneAvance(s.avance)));
}

