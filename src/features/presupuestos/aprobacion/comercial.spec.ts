import { armarComercial, type FaseMeta, type OfertaGanadora } from './comercial.js';

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
