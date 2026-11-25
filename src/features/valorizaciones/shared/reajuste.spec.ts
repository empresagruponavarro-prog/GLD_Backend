import { ACUMULADO_VACIO, calcularCuota, netoSinDescuentos, type CondicionesCalculo, type MontosDocumento } from './cuota.js';

const doc: MontosDocumento = { total: 1000, renta4ta: 0, detraccion: 0, detraccionSoles: 0, retencionIgv: 0 };
const cond: CondicionesCalculo = { adelantoPct: 0, garantiaPct: 10, numeroValorizaciones: 2 };

describe('reajuste (R) de una cuota', () => {
  it('sin reajuste el neto es el de siempre (valorizado − garantía)', () => {
    const c = calcularCuota(doc, cond, ACUMULADO_VACIO, { numero: 1, valorizado: 500, esUltima: false });
    expect(c.reajuste).toBe(0);
    expect(c.neto).toBe(450);
  });

  it('un reajuste positivo se suma al neto y no cambia lo valorizado, lo facturable ni la garantía', () => {
    const base = calcularCuota(doc, cond, ACUMULADO_VACIO, { numero: 1, valorizado: 500, esUltima: false });
    const c = calcularCuota(doc, cond, ACUMULADO_VACIO, { numero: 1, valorizado: 500, esUltima: false, reajuste: 23.45 });
    expect(c.reajuste).toBe(23.45);
    expect(c.neto).toBe(473.45);
    expect(c.valorizado).toBe(base.valorizado);
    expect(c.facturable).toBe(base.facturable);
    expect(c.garantia).toBe(base.garantia);
  });

  it('un reajuste negativo resta, pero nunca deja el neto bajo cero', () => {
    expect(calcularCuota(doc, cond, ACUMULADO_VACIO, { numero: 1, valorizado: 500, esUltima: false, reajuste: -50 }).neto).toBe(400);
    const c = calcularCuota(doc, cond, ACUMULADO_VACIO, { numero: 1, valorizado: 500, esUltima: false, reajuste: -9999 });
    expect(c.neto).toBe(0);
    expect(c.reajuste).toBe(-450);
  });

  it('los deductivos caben sobre el neto ya reajustado', () => {
    const c = calcularCuota(doc, cond, ACUMULADO_VACIO, { numero: 1, valorizado: 500, esUltima: false, reajuste: 50 });
    expect(netoSinDescuentos(c)).toBe(500);
  });
});
