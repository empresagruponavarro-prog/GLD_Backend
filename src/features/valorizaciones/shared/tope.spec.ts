import { calcularTope, mensajeTope } from './tope.js';

/** Los tres contratistas del Excel «VAL3 TAMBO PANAMERICANA NORTE PAIJAN» (hoja «3) CONTRATISTAS»), garantía 10 %. */
describe('tope de consumo del contratista', () => {
  it('PECHE HUAMAN: 49,32 % del contrato, quedan 19 120,27 hasta el tope de 42 300', () => {
    const t = calcularTope({ total: 47000, garantiaPct: 10, valorizado: 23179.73, deductivos: 0 });
    expect(t.tope).toBe(42300);
    expect(t.consumido).toBe(23179.73);
    expect(t.saldoHastaTope).toBe(19120.27);
    expect(t.consumidoPct).toBe(49.32);
    expect(t.exceso).toBe(0);
    expect(t.estado).toBe('DENTRO');
  });

  it('DATA INNOVATION: los 15 000 de materiales consumen contrato junto con lo valorizado', () => {
    const t = calcularTope({ total: 45500, garantiaPct: 10, valorizado: 20475, deductivos: 15000 });
    expect(t.consumido).toBe(35475);
    expect(t.saldoHastaTope).toBe(5475);
    expect(t.consumidoPct).toBe(77.97);
    expect(t.estado).toBe('DENTRO');
  });

  it('LIEL 23: valorizado más el descuento de 150', () => {
    const t = calcularTope({ total: 13000, garantiaPct: 10, valorizado: 3900, deductivos: 150 });
    expect(t.consumido).toBe(4050);
    expect(t.saldoHastaTope).toBe(7650);
  });

  it('pasa a CERCA desde el 80 % del contrato', () => {
    expect(calcularTope({ total: 1000, garantiaPct: 10, valorizado: 799, deductivos: 0 }).estado).toBe('DENTRO');
    expect(calcularTope({ total: 1000, garantiaPct: 10, valorizado: 800, deductivos: 0 }).estado).toBe('CERCA');
  });

  it('EN_TOPE cuando no queda margen y EXCEDE con el monto que pasa', () => {
    expect(calcularTope({ total: 1000, garantiaPct: 10, valorizado: 700, deductivos: 200 }).estado).toBe('EN_TOPE');
    const e = calcularTope({ total: 1000, garantiaPct: 10, valorizado: 700, deductivos: 350 });
    expect(e.estado).toBe('EXCEDE');
    expect(e.exceso).toBe(150);
    expect(e.saldoHastaTope).toBe(0);
    expect(mensajeTope(e)).toContain('150.00');
  });

  it('un contrato liquidado no muestra semáforo', () => {
    const t = calcularTope({ total: 1000, garantiaPct: 10, valorizado: 1000, deductivos: 0, liquidado: true });
    expect(t.estado).toBe('LIQUIDADO');
    expect(t.exceso).toBe(100);
  });

  it('sin garantía el tope es el contrato entero; sin total no hay porcentaje', () => {
    expect(calcularTope({ total: 500, garantiaPct: 0, valorizado: 100, deductivos: 0 }).tope).toBe(500);
    expect(calcularTope({ total: 0, garantiaPct: 10, valorizado: 0, deductivos: 0 }).consumidoPct).toBe(0);
  });
});
