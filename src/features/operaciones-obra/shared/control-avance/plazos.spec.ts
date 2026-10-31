import { aDia } from './calendario.js';
import { diasDeRetraso, diasFueraDePlazo, proximoAVencer } from './plazos.js';
import { cumplimientoEntrega, porcentajeATiempo, postVenta } from './postventa.js';

const d = aDia;
const HOY = d('2026-10-23');

describe('plazos · RC-14 días fuera de plazo', () => {
  const e = { enEjecucion: true, inicio: d('2026-08-31'), real: 80, finVigente: d('2026-10-02'), hoy: HOY };

  it('ejemplo de la documentación: fin 02/10 y hoy 23/10 = 21 días', () => {
    expect(diasFueraDePlazo(e)).toBe(21);
  });
  it('no hay atraso si el fin vigente es hoy o futuro', () => {
    expect(diasFueraDePlazo({ ...e, finVigente: HOY })).toBe(0);
    expect(diasFueraDePlazo({ ...e, finVigente: d('2026-10-30') })).toBe(0);
  });
  it('una obra terminada, no iniciada o no en ejecución no está fuera de plazo', () => {
    expect(diasFueraDePlazo({ ...e, real: 100 })).toBe(0);
    expect(diasFueraDePlazo({ ...e, inicio: d('2026-11-01') })).toBe(0);
    expect(diasFueraDePlazo({ ...e, enEjecucion: false })).toBe(0);
  });
  it('una reprogramación que mueve el fin vigente evita el atraso', () => {
    expect(diasFueraDePlazo({ ...e, finVigente: d('2026-10-02') + 21 })).toBe(0);
  });
});

describe('plazos · RC-15 días de retraso', () => {
  // Plan lineal: 10 % por día desde el 10/10 hasta el 19/10. Corte = 18/10.
  const programadoEn = (t: number) => Math.max(0, Math.min(100, (t - d('2026-10-09')) * 10));
  const e = {
    enEjecucion: true, inicio: d('2026-10-10'), hoy: d('2026-10-19'), real: 50, sinAvance: false, enPausa: false,
    corte: d('2026-10-18'), programadoEn, tolerancia: 0.5,
  };

  it('el corte menos la última fecha en que el plan pedía el avance real', () => {
    // El plan pedía 50 % el 14/10 → va 4 días detrás (18/10 − 14/10).
    expect(diasDeRetraso(e)).toBe(4);
  });
  it('al día = 0', () => {
    expect(diasDeRetraso({ ...e, real: 90 })).toBe(0);
    expect(diasDeRetraso({ ...e, real: 89.6 })).toBe(0); // dentro de la tolerancia
  });
  it('sin avance reportado, con pausa vigente, no iniciada o terminada = 0', () => {
    expect(diasDeRetraso({ ...e, sinAvance: true })).toBe(0);
    expect(diasDeRetraso({ ...e, enPausa: true })).toBe(0);
    expect(diasDeRetraso({ ...e, inicio: d('2026-11-01') })).toBe(0);
    expect(diasDeRetraso({ ...e, real: 100 })).toBe(0);
    expect(diasDeRetraso({ ...e, enEjecucion: false })).toBe(0);
  });
  it('sin ningún avance real: el retraso llega hasta el inicio', () => {
    expect(diasDeRetraso({ ...e, real: 0 })).toBe(d('2026-10-18') - (d('2026-10-10') - 1));
  });
});

describe('plazos · RC-16 próximo a vencer', () => {
  const e = { enEjecucion: true, inicio: d('2026-09-01'), finControl: d('2026-10-30'), hoy: HOY };
  it('el fin de control cae entre hoy y hoy + 7', () => {
    expect(proximoAVencer(e)).toBe(true); // 30/10 = hoy + 7
    expect(proximoAVencer({ ...e, finControl: HOY })).toBe(true);
    expect(proximoAVencer({ ...e, finControl: d('2026-10-31') })).toBe(false);
    expect(proximoAVencer({ ...e, finControl: d('2026-10-22') })).toBe(false);
  });
  it('solo obras en ejecución ya iniciadas', () => {
    expect(proximoAVencer({ ...e, enEjecucion: false })).toBe(false);
    expect(proximoAVencer({ ...e, inicio: d('2026-11-01') })).toBe(false);
  });
  it('los días son configurables', () => {
    expect(proximoAVencer({ ...e, finControl: d('2026-10-31'), dias: 10 })).toBe(true);
  });
});

describe('post venta · RC-18', () => {
  it('empieza en la entrega real; sin cierre queda «En curso» y cuenta hasta hoy', () => {
    const p = postVenta(d('2026-10-03'), d('2026-09-30'), null, HOY);
    expect(p).toMatchObject({ dias: 20, cerrada: false, texto: 'En curso', cierre: null });
  });
  it('sin entrega real usa el fin original', () => {
    expect(postVenta(null, d('2026-10-03'), null, HOY).dias).toBe(20);
  });
  it('con cierre: «Cerrada en N días»', () => {
    const p = postVenta(d('2026-10-03'), d('2026-09-30'), d('2026-10-13'), HOY);
    expect(p).toMatchObject({ dias: 10, cerrada: true, texto: 'Cerrada en 10 días' });
  });
  it('un cierre anterior a la entrega se ignora (RV-20)', () => {
    const p = postVenta(d('2026-10-03'), d('2026-09-30'), d('2026-10-01'), HOY);
    expect(p.cerrada).toBe(false);
  });
});

describe('culminadas · RC-19', () => {
  it('desfase = entrega − fin vigente; ≤ 0 es a tiempo', () => {
    expect(cumplimientoEntrega(d('2026-10-03'), d('2026-10-03'), null)).toMatchObject({ desfase: 0, aTiempo: true, diasPostVenta: null });
    expect(cumplimientoEntrega(d('2026-10-01'), d('2026-10-03'), null)).toMatchObject({ desfase: -2, aTiempo: true });
    expect(cumplimientoEntrega(d('2026-10-12'), d('2026-10-03'), d('2026-10-20'))).toMatchObject({ desfase: 9, aTiempo: false, diasPostVenta: 8 });
  });
  it('% a tiempo: 7 de 11 = 64 %', () => {
    const lista = [...Array(7).fill(true), ...Array(4).fill(false)].map((a) => ({ desfase: a ? 0 : 5, aTiempo: a, diasPostVenta: null }));
    expect(porcentajeATiempo(lista)).toBe(64);
    expect(porcentajeATiempo([])).toBe(0);
  });
});
