import { armarAdjudicado, importes, type FilaAdjudicado } from './adjudicado.js';

const fila = (o: Partial<FilaAdjudicado>): FilaAdjudicado => ({
  id_fase: 1,
  fase: 'ACABADOS',
  id_subfase: 10,
  subfase: 'PINTURA',
  id_item: 100,
  codigo: 'P-1',
  descripcion: 'PINTURA LATEX',
  unidad: 'M2',
  cantidad: 10,
  pu_meta: 5,
  proveedor: null,
  pu_adjudicado: null,
  sin_tipo_cambio: false,
  ...o,
});

describe('importes', () => {
  it('diferencia y % sobre el Meta', () => {
    expect(importes(100, 90)).toEqual({ meta: 100, adjudicado: 90, diferencia: -10, diferencia_pct: -10 });
    expect(importes(80, 100)).toEqual({ meta: 80, adjudicado: 100, diferencia: 20, diferencia_pct: 25 });
  });

  it('con Meta 0 no hay % (no se divide)', () => {
    expect(importes(0, 12.5).diferencia_pct).toBeNull();
  });
});

describe('armarAdjudicado', () => {
  it('un ítem adjudicado vale su oferta; el que no tiene ganador vale el Meta (diferencia 0)', () => {
    const r = armarAdjudicado([
      fila({ id_item: 1, cantidad: 10, pu_meta: 5, pu_adjudicado: 4.5, proveedor: 'A' }),
      fila({ id_item: 2, cantidad: 2, pu_meta: 15 }),
    ]);
    const [a, b] = r.fases[0].subfases[0].items;
    expect(a).toMatchObject({ meta: 50, adjudicado: 45, diferencia: -5, diferencia_pct: -10, estado: 'ADJUDICADO', proveedor: 'A' });
    expect(b).toMatchObject({ meta: 30, adjudicado: 30, diferencia: 0, estado: 'SIN_ADJUDICAR', proveedor: null });
    expect(r.totales).toEqual({ meta: 80, adjudicado: 75, diferencia: -5, diferencia_pct: -6.25 });
    expect(r).toMatchObject({ items_total: 2, items_adjudicados: 1, items_sin_adjudicar: 1, items_sin_tipo_cambio: 0 });
  });

  it('agrupa fase → subfase → ítem y suma cada nivel', () => {
    const r = armarAdjudicado([
      fila({ id_item: 1, pu_adjudicado: 6, proveedor: 'A' }),
      fila({ id_item: 2, id_subfase: 11, subfase: 'CIELO RASO', pu_adjudicado: 4, proveedor: 'B' }),
      fila({ id_item: 3, id_fase: 2, fase: 'ELÉCTRICAS', id_subfase: 20, subfase: 'TABLEROS', pu_meta: 100, cantidad: 1 }),
    ]);
    expect(r.fases.map((f) => f.fase)).toEqual(['ACABADOS', 'ELÉCTRICAS']);
    expect(r.fases[0].subfases.map((s) => [s.subfase, s.meta, s.adjudicado])).toEqual([
      ['PINTURA', 50, 60],
      ['CIELO RASO', 50, 40],
    ]);
    expect(r.fases[0]).toMatchObject({ meta: 100, adjudicado: 100, diferencia: 0 });
    expect(r.fases[1]).toMatchObject({ meta: 100, adjudicado: 100 });
    expect(r.totales.meta).toBe(200);
  });

  it('un ganador sin tipo de cambio queda marcado y vale el Meta', () => {
    const r = armarAdjudicado([fila({ pu_adjudicado: null, proveedor: 'DÓLARES SAC', sin_tipo_cambio: true })]);
    const it = r.fases[0].subfases[0].items[0];
    expect(it).toMatchObject({ estado: 'SIN_TIPO_CAMBIO', adjudicado: 50, diferencia: 0, proveedor: null });
    expect(r.items_sin_tipo_cambio).toBe(1);
  });

  it('sin ítems, todo en cero', () => {
    expect(armarAdjudicado([])).toMatchObject({ fases: [], totales: { meta: 0, adjudicado: 0, diferencia: 0, diferencia_pct: null }, items_total: 0 });
  });
});
