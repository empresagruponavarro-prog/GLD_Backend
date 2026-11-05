import { agruparLineasFur } from './lineas-fur.js';

const item = (id_producto: number | null, cat: number, Cantidad: number | string | null, CostoUnitario: number | string | null) => ({
  id_producto,
  id_detalle_categoria: cat,
  Cantidad,
  CostoUnitario,
});

describe('presupuestos / agruparLineasFur (una línea por producto y subfase)', () => {
  it('el mismo producto en dos subfases da dos líneas, cada una con su subfase', () => {
    const lineas = agruparLineasFur([item(7, 100, 10, 2), item(7, 200, 5, 3)]);

    expect(lineas).toEqual([
      { id_producto: 7, id_ppto_detalle_categoria: 100, cantidad: 10, costoUnitario: 2 },
      { id_producto: 7, id_ppto_detalle_categoria: 200, cantidad: 5, costoUnitario: 3 },
    ]);
  });

  it('el mismo producto repetido en la misma subfase suma la cantidad y toma el mayor costo', () => {
    const [linea, ...resto] = agruparLineasFur([item(7, 100, '10', '2.5'), item(7, 100, '4', '3.1')]);

    expect(resto).toHaveLength(0);
    expect(linea).toMatchObject({ cantidad: 14, costoUnitario: 3.1 });
  });

  it('ignora ítems sin producto, sin cantidad o con cantidad cero', () => {
    expect(agruparLineasFur([item(null, 100, 5, 1), item(7, 100, 0, 1), item(8, 100, null, 1), item(9, 100, -2, 1)])).toEqual([]);
  });

  it('conserva el orden de aparición', () => {
    const ids = agruparLineasFur([item(3, 1, 1, 1), item(1, 1, 1, 1), item(2, 1, 1, 1)]).map((l) => l.id_producto);

    expect(ids).toEqual([3, 1, 2]);
  });

  it('sin costo unitario la línea queda en 0 (no rompe)', () => {
    expect(agruparLineasFur([item(7, 100, 3, null)])[0].costoUnitario).toBe(0);
  });
});
