import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  cantidadCompleta,
  modoCotizacion,
  sigueSiendoGanadora,
  validarAdjudicable,
  validarLineasCotizacion,
  type ItemFase,
} from './adjudicacion.js';

const item = (id: number, cantidad: number, cubierto = false): [number, ItemFase] => [id, { id, cantidad, cubierto, etiqueta: `P-${id}` }];
const items = new Map<number, ItemFase>([item(1, 10), item(2, 5), item(3, 4, true)]);

describe('presupuesto / modo de cotización según el estado', () => {
  it.each(['EN_DESARROLLO', 'EN_REVISION', 'OBSERVADO'])('%s: se cotiza todo', (estado) => {
    expect(modoCotizacion(estado)).toBe('LIBRE');
  });

  it('aprobado: solo los ítems sin orden registrada (D-12)', () => {
    expect(modoCotizacion('APROBADO')).toBe('SOLO_NO_CUBIERTOS');
  });

  it.each(['ANULADO', 'ENTREGADO', 'LIQUIDADO'])('%s: 409', (estado) => {
    expect(() => modoCotizacion(estado)).toThrow(ConflictException);
  });
});

describe('presupuesto / validar las líneas de una cotización', () => {
  it('acepta ítems de la fase con cantidad hasta la del presupuesto', () => {
    expect(() =>
      validarLineasCotizacion([{ id_ppto_item: 1, cantidad: '10' }, { id_ppto_item: 2, cantidad: '2.5' }], items, 'LIBRE'),
    ).not.toThrow();
  });

  it('un ítem que no es de la fase: 400', () => {
    expect(() => validarLineasCotizacion([{ id_ppto_item: 99, cantidad: '1' }], items, 'LIBRE')).toThrow(BadRequestException);
  });

  it('ítems repetidos: 400', () => {
    expect(() =>
      validarLineasCotizacion([{ id_ppto_item: 1, cantidad: '1' }, { id_ppto_item: 1, cantidad: '2' }], items, 'LIBRE'),
    ).toThrow(/repetidos/);
  });

  it('más cantidad que el presupuesto: 400; cantidad 0: 400', () => {
    expect(() => validarLineasCotizacion([{ id_ppto_item: 1, cantidad: '10.5' }], items, 'LIBRE')).toThrow(/supera/);
    expect(() => validarLineasCotizacion([{ id_ppto_item: 1, cantidad: '0' }], items, 'LIBRE')).toThrow(/mayor a 0/);
  });

  it('un ítem que el proveedor no ofrece no valida cantidad, pero debe quedar al menos uno ofrecido', () => {
    expect(() =>
      validarLineasCotizacion([{ id_ppto_item: 1, cantidad: '10' }, { id_ppto_item: 2, cotiza: false, cantidad: '0' }], items, 'LIBRE'),
    ).not.toThrow();
    expect(() => validarLineasCotizacion([{ id_ppto_item: 1, cotiza: false, cantidad: '0' }], items, 'LIBRE')).toThrow(/al menos un ítem/);
  });

  it('presupuesto aprobado: un ítem con orden registrada devuelve 409; en modo libre no se mira', () => {
    const lineas = [{ id_ppto_item: 3, cantidad: '4' }];
    expect(() => validarLineasCotizacion(lineas, items, 'SOLO_NO_CUBIERTOS')).toThrow(ConflictException);
    expect(() => validarLineasCotizacion(lineas, items, 'LIBRE')).not.toThrow();
  });
});

describe('presupuesto / adjudicar un ítem a un proveedor', () => {
  it('cantidad completa y ofrecido: se puede', () => {
    expect(() => validarAdjudicable(items.get(1)!, { cotiza: true, cantidad: 10 })).not.toThrow();
  });

  it('respuesta 5: una cantidad menor no se adjudica (no se reparte el ítem)', () => {
    expect(() => validarAdjudicable(items.get(1)!, { cotiza: true, cantidad: 6 })).toThrow(/completo a un solo proveedor/);
  });

  it('una línea que el proveedor no ofrece no se adjudica', () => {
    expect(() => validarAdjudicable(items.get(1)!, { cotiza: false, cantidad: 10 })).toThrow(BadRequestException);
  });

  it('un ítem con orden registrada no cambia de proveedor: 409', () => {
    expect(() => validarAdjudicable(items.get(3)!, { cotiza: true, cantidad: 4 })).toThrow(ConflictException);
  });

  it('cantidadCompleta tolera el redondeo de dos decimales', () => {
    expect(cantidadCompleta(2.5, 2.5)).toBe(true);
    expect(cantidadCompleta(2.504, 2.5)).toBe(true);
    expect(cantidadCompleta(2.51, 2.5)).toBe(false);
  });

  it('al editar la línea ganadora: si deja de cotizar la cantidad completa, el ítem pierde el ganador', () => {
    expect(sigueSiendoGanadora({ cotiza: true, cantidad: 10 }, 10)).toBe(true);
    expect(sigueSiendoGanadora({ cotiza: true, cantidad: 8 }, 10)).toBe(false);
    expect(sigueSiendoGanadora({ cotiza: false, cantidad: 10 }, 10)).toBe(false);
  });
});
