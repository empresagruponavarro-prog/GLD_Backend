import { BadRequestException } from '@nestjs/common';
import { prorratearTotal } from './prorrateo.js';

const DEMOLICIONES = [
  { id: 1, cantidad: 0, costoTotal: 0 }, // 1.01: sin cantidad en el Meta
  { id: 2, cantidad: 26.45, costoTotal: 431.66 }, // 1.02
  { id: 3, cantidad: 33.76, costoTotal: 713.01 }, // 1.03
];

const suma = (montos: string[]) => montos.reduce((s, m) => s + Math.round(Number(m) * 100), 0) / 100;

describe('prorratearTotal', () => {
  it('reparte el total en proporción al costo Meta y la suma sale exacta', () => {
    const r = prorratearTotal(1000, DEMOLICIONES);
    expect(r.map((l) => l.monto)).toEqual(['0.00', '377.10', '622.90']);
    expect(suma(r.map((l) => l.monto))).toBe(1000);
  });

  it('un ítem sin cantidad queda fuera: no cotiza y no recibe nada', () => {
    const [sinCantidad] = prorratearTotal(1000, DEMOLICIONES);
    expect(sinCantidad).toEqual({ id_ppto_item: 1, cotiza: false, cantidad: '0', precio_unitario: '0', monto: '0.00' });
  });

  it('el precio unitario es monto / cantidad y reproduce el monto al multiplicar', () => {
    const r = prorratearTotal(1000, DEMOLICIONES);
    for (const [i, cantidad] of [[1, 26.45], [2, 33.76]] as const) {
      const l = r[i];
      expect(Number(l.precio_unitario)).toBeCloseTo(Number(l.monto) / cantidad, 6);
      expect(Math.round(Number(l.precio_unitario) * cantidad * 100) / 100).toBe(Number(l.monto));
    }
  });

  it('el descuadre de céntimos lo absorbe el ítem de mayor peso', () => {
    // 100.00 entre tres ítems iguales: 33.33 + 33.33 + 33.33 = 99.99; el céntimo sobrante va al primero (mismo peso, menor id).
    const r = prorratearTotal(100, [
      { id: 7, cantidad: 1, costoTotal: 10 },
      { id: 8, cantidad: 1, costoTotal: 10 },
      { id: 9, cantidad: 1, costoTotal: 10 },
    ]);
    expect(r.map((l) => l.monto)).toEqual(['33.34', '33.33', '33.33']);
    expect(suma(r.map((l) => l.monto))).toBe(100);
  });

  it('un ítem con cantidad pero sin costo recibe 0 y cotiza', () => {
    const r = prorratearTotal(500, [
      { id: 1, cantidad: 2, costoTotal: 0 },
      { id: 2, cantidad: 5, costoTotal: 50 },
    ]);
    expect(r[0]).toMatchObject({ cotiza: true, monto: '0.00', precio_unitario: '0.00000000' });
    expect(r[1].monto).toBe('500.00');
  });

  it('con un solo ítem, todo el total es para él', () => {
    const [l] = prorratearTotal(250.5, [{ id: 4, cantidad: 3, costoTotal: 99 }]);
    expect(l.monto).toBe('250.50');
    expect(l.precio_unitario).toBe('83.50000000');
  });

  it('rechaza un total que no es mayor a 0', () => {
    expect(() => prorratearTotal(0, DEMOLICIONES)).toThrow(BadRequestException);
    expect(() => prorratearTotal(-5, DEMOLICIONES)).toThrow('mayor a 0');
    expect(() => prorratearTotal(Number.NaN, DEMOLICIONES)).toThrow(BadRequestException);
  });

  it('rechaza una subpartida sin costo en el Meta (no hay base para repartir)', () => {
    expect(() => prorratearTotal(100, [{ id: 1, cantidad: 4, costoTotal: 0 }, { id: 2, cantidad: 2, costoTotal: 0 }])).toThrow('no tiene costo en el Meta');
  });

  it('rechaza una subpartida sin ítems con cantidad', () => {
    expect(() => prorratearTotal(100, [{ id: 1, cantidad: 0, costoTotal: 0 }])).toThrow('no tiene ítems con cantidad');
    expect(() => prorratearTotal(100, [])).toThrow(BadRequestException);
  });

  it('rechaza ítems repetidos', () => {
    expect(() => prorratearTotal(100, [{ id: 1, cantidad: 1, costoTotal: 1 }, { id: 1, cantidad: 1, costoTotal: 1 }])).toThrow('repetidos');
  });
});
