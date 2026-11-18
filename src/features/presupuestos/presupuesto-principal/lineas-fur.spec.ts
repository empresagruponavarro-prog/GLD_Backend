import { agruparLineasFur, separarItemsPedidos } from './lineas-fur.js';

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

describe('presupuestos / separarItemsPedidos (ítems que «Generar FURs» ya no puede pedir)', () => {
  const it2 = (id: number, producto: number, cat: number, ganadora: number | null = null) => ({ id, id_producto: producto, id_detalle_categoria: cat, Cantidad: 1, CostoUnitario: 1, id_ppto_cot_detalle_ganadora: ganadora });
  const pedida = (id_ppto_item: number | null, producto: number, cat: number | null, deAdjudicacion = false) => ({ id_ppto_item, id_producto: producto, id_ppto_detalle_categoria: cat, deAdjudicacion });

  it('sin nada pedido ni adjudicado, todo queda libre', () => {
    const r = separarItemsPedidos([it2(1, 7, 100), it2(2, 8, 100)], []);
    expect(r.libres.map((i) => i.id)).toEqual([1, 2]);
    expect(r.excluidos).toEqual([]);
  });

  it('un ítem con proveedor ganador lo genera la adjudicación: queda fuera', () => {
    const r = separarItemsPedidos([it2(1, 7, 100, 55), it2(2, 8, 100)], []);
    expect(r.excluidos.map((i) => i.id)).toEqual([1]);
    expect(r.libres.map((i) => i.id)).toEqual([2]);
  });

  it('un ítem que ya está en una línea de un FUR vigente queda fuera', () => {
    const r = separarItemsPedidos([it2(1, 7, 100), it2(2, 8, 100)], [pedida(2, 8, 100, true)]);
    expect(r.excluidos.map((i) => i.id)).toEqual([2]);
  });

  it('una línea de «Generar FURs» que juntó dos ítems deja fuera al otro ítem del mismo producto y subfase', () => {
    const r = separarItemsPedidos([it2(1, 7, 100), it2(2, 7, 100), it2(3, 7, 200)], [pedida(1, 7, 100)]);
    expect(r.excluidos.map((i) => i.id)).toEqual([1, 2]);
    expect(r.libres.map((i) => i.id)).toEqual([3]); // otra subfase: sigue libre
  });

  it('una línea de adjudicación NO deja fuera a otros ítems del mismo producto y subfase', () => {
    const r = separarItemsPedidos([it2(1, 7, 100), it2(2, 7, 100)], [pedida(1, 7, 100, true)]);
    expect(r.excluidos.map((i) => i.id)).toEqual([1]);
    expect(r.libres.map((i) => i.id)).toEqual([2]);
  });
});
