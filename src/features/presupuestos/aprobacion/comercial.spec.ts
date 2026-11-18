import { armarComercial, type FaseMeta, type ItemComercialEntrada, type OfertaGanadora } from './comercial.js';

const FASES: FaseMeta[] = [
  { id_fase: 1, nombre_fase: 'ESTRUCTURA', meta: 1000 },
  { id_fase: 2, nombre_fase: 'ACABADOS', meta: 500 },
  { id_fase: 3, nombre_fase: 'INSTALACIONES', meta: 300 },
];
const oferta = (id_fase: number, monto: number | null, n = 1): OfertaGanadora => ({
  id_fase,
  id_requerimiento: 100 + n,
  numero_requerimiento: `FUR-00000${n}`,
  estado_requerimiento: 'APROBADO',
  proveedor: 'CONTRATISTA SAC',
  monto,
});

describe('presupuestos / armarComercial (SP-16)', () => {
  it('sin cotizaciones ganadoras el Comercial es igual al Meta', () => {
    const r = armarComercial(FASES, []);

    expect(r.fases.map((f) => [f.comercial, f.fuente])).toEqual([[1000, 'META'], [500, 'META'], [300, 'META']]);
    expect(r.total).toEqual({ meta: 1800, comercial: 1800, diferencia: 0 });
    expect(r.fases_cotizadas).toBe(0);
  });

  it('una fase con ganadora toma el monto de la cotización; las demás conservan el Meta', () => {
    const r = armarComercial(FASES, [oferta(1, 900.5)]);

    expect(r.fases[0]).toMatchObject({ meta: 1000, comercial: 900.5, fuente: 'COTIZACION' });
    expect(r.fases[0].requerimientos).toEqual([{ id: 101, numero: 'FUR-000001', estado: 'APROBADO', proveedor: 'CONTRATISTA SAC', monto: 900.5 }]);
    expect(r.fases[1]).toMatchObject({ comercial: 500, fuente: 'META' });
    expect(r.total).toEqual({ meta: 1800, comercial: 1700.5, diferencia: -99.5 });
    expect(r.fases_cotizadas).toBe(1);
  });

  it('varios FUR ganadores de la misma fase se suman', () => {
    const r = armarComercial(FASES, [oferta(2, 200.25, 1), oferta(2, 350, 2)]);

    expect(r.fases[1].comercial).toBe(550.25);
    expect(r.fases[1].requerimientos).toHaveLength(2);
  });

  it('una ganadora sin tipo de cambio no se valoriza: la fase conserva el Meta y se avisa', () => {
    const r = armarComercial(FASES, [oferta(3, null)]);

    expect(r.fases[2]).toMatchObject({ comercial: 300, fuente: 'META', sin_tipo_cambio: true, requerimientos: [] });
  });

  it('una parte valorizada y otra sin tipo de cambio: cuenta lo valorizado y avisa', () => {
    const r = armarComercial(FASES, [oferta(1, 400, 1), oferta(1, null, 2)]);

    expect(r.fases[0]).toMatchObject({ comercial: 400, fuente: 'COTIZACION', sin_tipo_cambio: true });
  });

  it('ignora las ganadoras de fases que no están en el Meta y redondea a 2 decimales', () => {
    const r = armarComercial([{ id_fase: 1, nombre_fase: 'A', meta: 0.1 }], [oferta(99, 5), oferta(1, 0.2)]);

    expect(r.fases).toHaveLength(1);
    expect(r.total).toEqual({ meta: 0.1, comercial: 0.2, diferencia: 0.1 });
  });
});

describe('presupuestos / armarComercial por ítem adjudicado (plan 09)', () => {
  /** Ítem de la fase 1 (Meta S/ 1000 = 10 × 100). */
  const item = (id_item: number, costo_meta: number, cantidad: number, precio: number | null | undefined, id_fase = 1): ItemComercialEntrada => ({
    id_fase,
    id_item,
    codigo: `P-${id_item}`,
    descripcion: `Ítem ${id_item}`,
    cantidad,
    costo_meta,
    adjudicado: precio === undefined ? null : { proveedor: 'CONTRATISTA SAC', precio_sin_igv: precio },
  });

  it('todos los ítems con proveedor: la fase vale cantidad × precio de cada uno y el Meta no cambia', () => {
    const r = armarComercial(FASES, [], [item(1, 600, 10, 50), item(2, 400, 4, 90)]);

    expect(r.fases[0]).toMatchObject({ meta: 1000, comercial: 860, fuente: 'ADJUDICACION', items_adjudicados: 2, sin_tipo_cambio: false });
    expect(r.fases[0].items.map((i) => [i.meta, i.comercial, i.diferencia])).toEqual([[600, 500, -100], [400, 360, -40]]);
    expect(r.total).toEqual({ meta: 1800, comercial: 1660, diferencia: -140 });
    expect(r.fases_cotizadas).toBe(1);
  });

  it('la diferencia por ítem también va en porcentaje (negativa si el proveedor es más barato)', () => {
    const [i] = armarComercial(FASES, [], [item(1, 600, 10, 50)]).fases[0].items;

    expect(i.diferencia_pct).toBe(-16.67);
    expect(armarComercial(FASES, [], [item(2, 0, 1, 10)]).fases[0].items[0].diferencia_pct).toBeNull(); // Meta 0: sin porcentaje
  });

  it('fase mixta: los ítems sin proveedor se quedan al costo del Meta', () => {
    const r = armarComercial(FASES, [], [item(1, 600, 10, 50), item(2, 400, 4, undefined)]);

    expect(r.fases[0]).toMatchObject({ comercial: 900, fuente: 'MIXTA', items_adjudicados: 1 });
    expect(r.fases[0].items[1]).toMatchObject({ adjudicado: false, comercial: 400, diferencia: 0 });
  });

  it('un ganador sin tipo de cambio queda al Meta, se avisa y la fase es mixta', () => {
    const r = armarComercial(FASES, [], [item(1, 600, 10, 50), item(2, 400, 4, null)]);

    expect(r.fases[0]).toMatchObject({ comercial: 900, fuente: 'MIXTA', sin_tipo_cambio: true, items_adjudicados: 1 });
    expect(r.fases[0].items[1]).toMatchObject({ adjudicado: false, sin_tipo_cambio: true, comercial: 400 });
  });

  it('si el único ganador no tiene tipo de cambio la fase queda al Meta y avisa', () => {
    const r = armarComercial(FASES, [], [item(1, 600, 10, null)]);

    expect(r.fases[0]).toMatchObject({ comercial: 600, sin_tipo_cambio: true });
  });

  it('con ítems adjudicados, los FUR ganadores de la fase no se suman aparte (no se cuenta dos veces)', () => {
    const r = armarComercial(FASES, [oferta(1, 777)], [item(1, 1000, 10, 80)]);

    expect(r.fases[0]).toMatchObject({ comercial: 800, fuente: 'ADJUDICACION', requerimientos: [] });
  });

  it('una fase sin ítems adjudicados mantiene la regla anterior aunque se pidan los ítems', () => {
    const r = armarComercial(FASES, [oferta(2, 450)], [item(1, 300, 3, undefined, 2)]);

    expect(r.fases[1]).toMatchObject({ comercial: 450, fuente: 'COTIZACION', items_adjudicados: 0 });
    expect(r.fases[1].items).toHaveLength(1); // los ítems se muestran, con diferencia 0
    expect(r.fases[1].items[0].diferencia).toBe(0);
  });

  it('las fases se calculan por separado y los ítems de fases ajenas se ignoran', () => {
    const r = armarComercial(FASES, [], [item(1, 1000, 10, 90, 1), item(2, 500, 5, 120, 2), item(3, 50, 1, 1, 99)]);

    expect(r.fases.map((f) => [f.comercial, f.fuente])).toEqual([[900, 'ADJUDICACION'], [600, 'ADJUDICACION'], [300, 'META']]);
    expect(r.total).toEqual({ meta: 1800, comercial: 1800, diferencia: 0 });
  });
});
