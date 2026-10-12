import { preciosOferta, totalesCotizacion } from './cotizacion.handler.js';

describe('cotizaciones / precios e IGV', () => {
  it('precio sin IGV: se queda igual; con IGV: suma 18 %', () => {
    const p = preciosOferta(100, false, true);
    expect(p.sin).toBe(100);
    expect(p.con).toBeCloseTo(118, 6);
  });

  it('si el proveedor cotizó con IGV incluido, el precio sin IGV es precio / 1.18', () => {
    const p = preciosOferta(118, true, true);
    expect(p.sin).toBeCloseTo(100, 6);
    expect(p.con).toBeCloseTo(118, 6);
  });

  it('un proveedor no afecto al IGV: el precio es el precio, aunque diga "incluye IGV"', () => {
    const p = preciosOferta(95, true, false);
    expect(p.sin).toBe(95);
    expect(p.con).toBe(95);
  });

  it('totales: ignora lo que el proveedor no cotiza', () => {
    const t = totalesCotizacion(
      [
        { cotiza: true, cantidad: 10, precio: 100 },
        { cotiza: true, cantidad: 1, precio: 1000 },
        { cotiza: false, cantidad: 5, precio: 9999 },
      ],
      false,
      true,
    );
    expect(t).toEqual({ subtotal: 2000, igv: 360, total: 2360 });
  });

  it('totales de un proveedor no afecto no llevan IGV', () => {
    const t = totalesCotizacion([{ cotiza: true, cantidad: 10, precio: 95 }, { cotiza: true, cantidad: 1, precio: 900 }], true, false);
    expect(t).toEqual({ subtotal: 1850, igv: 0, total: 1850 });
  });
});
