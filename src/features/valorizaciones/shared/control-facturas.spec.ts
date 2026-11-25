import { controlarFacturas, type CuotaParaFactura } from './control-facturas.js';

const cuota = (p: Partial<CuotaParaFactura> & Pick<CuotaParaFactura, 'id' | 'tipo' | 'numero'>): CuotaParaFactura => ({
  estado: 'APROBADA',
  facturable: 100,
  reajuste: 0,
  factura_numero: null,
  ...p,
});

describe('control de facturas del contratista', () => {
  it('sin cuotas aprobadas no hay nada que controlar', () => {
    expect(controlarFacturas([cuota({ id: 1, tipo: 'VALORIZACION', numero: 1, estado: 'BORRADOR' })]).estado).toBe('SIN_CUOTAS');
  });

  it('AL_DIA: todo lo aprobado tiene factura; la devolución de la garantía no cuenta', () => {
    const r = controlarFacturas([
      cuota({ id: 1, tipo: 'ADELANTO', numero: 0, factura_numero: 'F001-1' }),
      cuota({ id: 2, tipo: 'VALORIZACION', numero: 1, factura_numero: 'F001-2' }),
      cuota({ id: 3, tipo: 'GARANTIA', numero: 1 }),
    ]);
    expect(r.estado).toBe('AL_DIA');
    expect(r.filas).toHaveLength(2);
    expect(r.pendiente).toBe(0);
  });

  it('FALTA_ACTUAL: lo anterior calza y solo falta la última (amarillo del Excel)', () => {
    const r = controlarFacturas([
      cuota({ id: 1, tipo: 'VALORIZACION', numero: 1, facturable: 14249.73, factura_numero: 'F001-1' }),
      cuota({ id: 2, tipo: 'VALORIZACION', numero: 2, facturable: 8930 }),
    ]);
    expect(r.estado).toBe('FALTA_ACTUAL');
    expect(r.valorizadoAnterior).toBe(14249.73);
    expect(r.facturadoAnterior).toBe(14249.73);
    expect(r.valorizado).toBe(23179.73);
    expect(r.facturado).toBe(14249.73);
    expect(r.pendiente).toBe(8930);
  });

  it('ATRASADO: falta una factura anterior a la última cuota', () => {
    const r = controlarFacturas([
      cuota({ id: 1, tipo: 'VALORIZACION', numero: 1 }),
      cuota({ id: 2, tipo: 'VALORIZACION', numero: 2, factura_numero: 'F001-2' }),
    ]);
    expect(r.estado).toBe('ATRASADO');
  });

  it('el reajuste se factura junto con la cuota y el adelanto va primero', () => {
    const r = controlarFacturas([
      cuota({ id: 2, tipo: 'VALORIZACION', numero: 1, facturable: 100, reajuste: -5.5 }),
      cuota({ id: 1, tipo: 'ADELANTO', numero: 0, facturable: 50 }),
    ]);
    expect(r.filas.map((f) => f.tipo)).toEqual(['ADELANTO', 'VALORIZACION']);
    expect(r.filas[1].monto).toBe(94.5);
  });

  it('una factura en blanco no cuenta', () => {
    expect(controlarFacturas([cuota({ id: 1, tipo: 'VALORIZACION', numero: 1, factura_numero: '  ' })]).estado).toBe('FALTA_ACTUAL');
  });
});
