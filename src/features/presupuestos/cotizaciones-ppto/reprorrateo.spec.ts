import { compararLineas, type LineaGuardada } from './reprorrateo.js';
import type { LineaProrrateada } from './prorrateo.js';

const guardada = (id: number, cotiza: boolean, cantidad: number, precio: number): LineaGuardada => ({ id_ppto_item: id, cotiza, cantidad, precio_unitario: precio });
const nueva = (id: number, cotiza: boolean, cantidad: string, precio: string): LineaProrrateada => ({
  id_ppto_item: id,
  cotiza,
  cantidad,
  precio_unitario: precio,
  monto: '0.00',
});

describe('compararLineas (volver a repartir una cotización)', () => {
  it('sin ninguna diferencia no hay cambio ni ítems que ingresen', () => {
    const r = compararLineas([guardada(1, true, 10, 5), guardada(2, true, 2.5, 40)], [nueva(1, true, '10', '5.00000000'), nueva(2, true, '2.5', '40.00000000')]);
    expect(r).toEqual({ cambio: false, ingresan: [] });
  });

  it('un precio distinto es un cambio (el Meta del ítem se movió)', () => {
    const r = compararLineas([guardada(1, true, 10, 5)], [nueva(1, true, '10', '5.50000000')]);
    expect(r.cambio).toBe(true);
    expect(r.ingresan).toEqual([]);
  });

  it('una cantidad distinta es un cambio (se cambió la cantidad del ítem en el Base)', () => {
    const r = compararLineas([guardada(1, true, 10, 5)], [nueva(1, true, '20', '2.50000000')]);
    expect(r.cambio).toBe(true);
    expect(r.ingresan).toEqual([]);
  });

  it('compara números, no textos: 10 y 10.0000 son lo mismo', () => {
    expect(compararLineas([guardada(1, true, 10, 12.5)], [nueva(1, true, '10.0000', '12.50000000')]).cambio).toBe(false);
  });

  it('un ítem nuevo en la subpartida cambia la cotización e ingresa', () => {
    const r = compararLineas([guardada(1, true, 10, 5)], [nueva(1, true, '10', '5.00000000'), nueva(2, true, '3', '4.00000000')]);
    expect(r).toEqual({ cambio: true, ingresan: [2] });
  });

  it('un ítem nuevo sin cantidad cambia la cotización pero no ingresa (no cotiza)', () => {
    const r = compararLineas([guardada(1, true, 10, 5)], [nueva(1, true, '10', '5.00000000'), nueva(2, false, '0', '0')]);
    expect(r).toEqual({ cambio: true, ingresan: [] });
  });

  it('un ítem que estaba sin cantidad y ahora tiene ingresa', () => {
    const r = compararLineas([guardada(1, true, 10, 5), guardada(2, false, 0, 0)], [nueva(1, true, '10', '5.00000000'), nueva(2, true, '4', '1.25000000')]);
    expect(r).toEqual({ cambio: true, ingresan: [2] });
  });

  it('un ítem que ya cotizaba NO ingresa aunque cambie: así no recupera un ganador que se soltó al cambiar su producto', () => {
    const r = compararLineas([guardada(1, true, 10, 5)], [nueva(1, true, '12', '4.16666667')]);
    expect(r.ingresan).toEqual([]);
  });

  it('un ítem que dejó de tener cantidad es un cambio y no ingresa', () => {
    const r = compararLineas([guardada(1, true, 10, 5), guardada(2, true, 2, 8)], [nueva(1, true, '10', '6.60000000'), nueva(2, false, '0', '0')]);
    expect(r).toEqual({ cambio: true, ingresan: [] });
  });

  it('una línea guardada que ya no está en el reparto (ítem quitado de la subpartida) es un cambio', () => {
    const r = compararLineas([guardada(1, true, 10, 5), guardada(2, true, 2, 8)], [nueva(1, true, '10', '5.00000000')]);
    expect(r).toEqual({ cambio: true, ingresan: [] });
  });
});
