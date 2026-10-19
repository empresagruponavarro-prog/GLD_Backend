import { calcularTotalesItem, redondear2, sumarTotales } from './plantillas-items.handler.js';

describe('plantillas-items · cálculos', () => {
  it('redondea a 2 decimales sin errores de coma flotante', () => {
    expect(redondear2(1.005)).toBe(1.01);
    expect(redondear2(2.0199999999)).toBe(2.02);
    expect(redondear2(0)).toBe(0);
  });

  it('calcula costo y venta total de una línea', () => {
    expect(calcularTotalesItem(12.5, 35.4, 42)).toEqual({ CostoTotal: 442.5, VentaTotal: 525 });
    expect(calcularTotalesItem(0, 100, 120)).toEqual({ CostoTotal: 0, VentaTotal: 0 });
    expect(calcularTotalesItem(3, 0.1, 0.2)).toEqual({ CostoTotal: 0.3, VentaTotal: 0.6 });
  });

  it('suma los totales de la partida', () => {
    const r = sumarTotales([
      { CostoTotal: 0.1, VentaTotal: 0.2 },
      { CostoTotal: 0.2, VentaTotal: 0.4 },
    ]);
    expect(r).toEqual({ costoTotal: 0.3, ventaTotal: 0.6 });
  });
});
