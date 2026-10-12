import { calcularTributos, diasDeCredito, esSoles, esViernes, netoProveedor, sumarDias } from './tributos.js';

const base = {
  clase: 'ORDEN_COMPRA',
  afectoIgv: true,
  total: 1000,
  totalSoles: 1000,
  proveedorExceptuado: false,
};

describe('tributos / retencion del IGV', () => {
  it('retiene 3 % en una OC afecta mayor a S/ 700', () => {
    const r = calcularTributos(base);
    expect(r.retencion_monto).toBe(30);
    expect(r.retencion_porcentaje).toBe(3);
    expect(r.detraccion_monto).toBeNull();
  });

  it.each([
    ['proveedor exceptuado', { proveedorExceptuado: true }],
    ['no afecto al IGV', { afectoIgv: false }],
    ['total hasta S/ 700', { total: 700, totalSoles: 700 }],
    ['planilla', { clase: 'PLANILLA_PERSONAL' }],
    ['caja chica', { clase: 'CAJA_CHICA' }],
    ['gasto financiero', { clase: 'GASTO_FINANCIERO' }],
  ])('no retiene: %s', (_nombre, cambio) => {
    const r = calcularTributos({ ...base, ...cambio });
    expect(r.retencion_monto).toBeNull();
    expect(r.retencion_motivo).toMatch(/^No aplica/);
  });

  it('no retiene si el documento tiene detraccion', () => {
    const r = calcularTributos({ ...base, clase: 'ORDEN_SERVICIO', detraccionPorcentaje: 10 });
    expect(r.detraccion_monto).toBe(100);
    expect(r.retencion_monto).toBeNull();
    expect(r.retencion_motivo).toMatch(/detraccion/);
  });

  it('convierte a soles para el umbral pero retiene en la moneda del documento', () => {
    const r = calcularTributos({ ...base, total: 300, totalSoles: 1140 });
    expect(r.retencion_monto).toBe(9);
  });

  it('un USD 150 (S/ 570) no supera el umbral', () => {
    expect(calcularTributos({ ...base, total: 150, totalSoles: 570 }).retencion_monto).toBeNull();
  });

  it('respeta la retencion manual', () => {
    const r = calcularTributos({ ...base, retencionManual: 12.345 });
    expect(r.retencion_monto).toBe(12.35);
    expect(r.retencion_manual).toBe(true);
  });
});

describe('tributos / detraccion', () => {
  it('propone 10 % en una OS afecta sobre el umbral, en soles enteros', () => {
    const r = calcularTributos({ ...base, clase: 'ORDEN_SERVICIO', total: 1234.56, totalSoles: 1234.56 });
    expect(r.detraccion_porcentaje).toBe(10);
    expect(r.detraccion_monto).toBe(123);
  });

  it('no propone detraccion en una OC ni bajo el umbral', () => {
    expect(calcularTributos(base).detraccion_monto).toBeNull();
    expect(calcularTributos({ ...base, clase: 'ORDEN_SERVICIO', total: 500, totalSoles: 500 }).detraccion_monto).toBeNull();
  });

  it('el usuario puede poner 0 para quitar la detraccion', () => {
    const r = calcularTributos({ ...base, clase: 'ORDEN_SERVICIO', detraccionPorcentaje: 0 });
    expect(r.detraccion_monto).toBeNull();
    expect(r.retencion_monto).toBe(30);
  });

  it('en dolares la detraccion se calcula sobre el total en soles', () => {
    const r = calcularTributos({ ...base, clase: 'ORDEN_SERVICIO', total: 500, totalSoles: 1900 });
    expect(r.detraccion_monto).toBe(190);
  });
});

describe('tributos / neto y fechas', () => {
  it('resta renta 4ta, descuentos, detraccion y retencion', () => {
    expect(
      netoProveedor({ total: 1000, renta4ta: 80, dsctoCompras: 20, dsctoIntervencion: 10, dsctoOtros: 5, detraccionPorcentaje: 10, retencionMonto: 0 }),
    ).toBe(785);
    expect(netoProveedor({ total: 1000, retencionMonto: 30 })).toBe(970);
  });

  it('detecta viernes', () => {
    expect(esViernes('2026-10-16')).toBe(true);
    expect(esViernes('2026-10-15')).toBe(false);
  });

  it('suma dias y lee la forma de pago', () => {
    expect(sumarDias('2026-10-30', 3)).toBe('2026-11-02');
    expect(diasDeCredito('Credito 45 dias')).toBe(45);
    expect(diasDeCredito('Contado')).toBe(0);
    expect(diasDeCredito('Credito mayor a 45')).toBeNull();
    expect(diasDeCredito('Credito')).toBeNull();
  });

  it('reconoce soles por simbolo o id', () => {
    expect(esSoles('PEN', null)).toBe(true);
    expect(esSoles('30e2d31c', 'S/.')).toBe(true);
    expect(esSoles('USD', '$')).toBe(false);
  });
});
