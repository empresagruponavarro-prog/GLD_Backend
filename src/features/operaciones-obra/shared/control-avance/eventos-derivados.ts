import type { SeveridadEvento, TipoEventoObra } from './registrar-evento.js';
import type { ObraResumen } from './resumen-portafolio.js';

/**
 * Eventos que dependen del paso del tiempo y no de una escritura de alguien (D17): una obra pasa a
 * Retrasada, o vence su plazo. No hay planificador, así que se evalúan al leer el portafolio y solo
 * se guardan si algo cambió respecto del último evento de esa clase.
 */

/** Lo último que quedó registrado para una obra. */
export interface UltimosEventos {
  /** `valor_despues` del último evento SITUACION (situación normalizada), o null si no hay. */
  situacion: string | null;
  /** `valor_despues` del último evento VENCIDO (el fin vigente que venció), o null si no hay. */
  vencidoDeFin: string | null;
}

export interface EventoDerivado {
  idCentroCosto: number;
  tipo: Extract<TipoEventoObra, 'SITUACION' | 'VENCIDO'>;
  titulo: string;
  detalle: string | null;
  antes: string | null;
  despues: string;
  severidad: SeveridadEvento;
}

/**
 * La situación sin el número de semana: «Al día · Sem 5 en curso» y «Al día · Sem 6 en curso» son la
 * misma situación y no deben generar un aviso cada lunes.
 */
export function situacionClave(texto: string): string {
  return texto.startsWith('Al día') ? 'A tiempo' : texto;
}

const severidadDe = (clave: string): SeveridadEvento =>
  clave === 'Retrasada' ? 'crit' : clave === 'En riesgo' || clave === 'Por entregar' ? 'warn' : clave === 'A tiempo' || clave === 'Completada' ? 'good' : 'info';

/**
 * Decide qué eventos hay que guardar para una obra.
 * - Solo obras en ejecución (efectivo): las demás no se miden contra un cronograma.
 * - SITUACION: la primera vez se guarda como línea base (`antes = null`, severidad info) para poder
 *   detectar el próximo cambio; después, cada vez que cambia.
 * - VENCIDO: una sola vez por cada fin vigente que se vence.
 */
export function eventosDerivados(o: ObraResumen, previo: UltimosEventos): EventoDerivado[] {
  const r = o.resultado;
  if (r.estadoEfectivo !== 'EN_EJECUCION') return [];
  const eventos: EventoDerivado[] = [];

  const clave = situacionClave(r.situacion.texto);
  if (previo.situacion !== clave) {
    const inicial = previo.situacion === null;
    eventos.push({
      idCentroCosto: o.id_centro_costo,
      tipo: 'SITUACION',
      titulo: inicial ? `${o.nombre}: situación registrada (${clave})` : `${o.nombre} pasó a ${clave}`,
      detalle: `Desviación ${r.desviacion >= 0 ? '+' : ''}${Math.round(r.desviacion)} pp (${Math.floor(r.real)}% real vs ${Math.floor(r.programado)}% programado)`,
      antes: previo.situacion,
      despues: clave,
      severidad: inicial ? 'info' : severidadDe(clave),
    });
  }

  if (r.plazos.diasFueraDePlazo > 0 && previo.vencidoDeFin !== r.plazos.finVigente) {
    eventos.push({
      idCentroCosto: o.id_centro_costo,
      tipo: 'VENCIDO',
      titulo: `Plazo vencido: ${o.nombre}`,
      detalle: `Fin vigente ${r.plazos.finVigente} · ${r.plazos.diasFueraDePlazo} día${r.plazos.diasFueraDePlazo === 1 ? '' : 's'} fuera de plazo · avance real ${Math.floor(r.real)}%`,
      antes: null,
      despues: r.plazos.finVigente,
      severidad: 'crit',
    });
  }
  return eventos;
}
