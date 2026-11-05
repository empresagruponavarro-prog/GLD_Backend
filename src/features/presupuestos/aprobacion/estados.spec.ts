import { esAdicional, esAprobado, estadoMasAvanzado, estadoPptoDeTexto, textoEstadoCc, textoLegado } from './estados.js';

describe('estadoPptoDeTexto (DG1)', () => {
  it.each([
    ['Aprobado', 'APROBADO'],
    ['APROBADO', 'APROBADO'],
    ['En_Revision', 'EN_REVISION'],
    ['EN REVISION', 'EN_REVISION'],
    ['EN REVISIÓN', 'EN_REVISION'],
    ['REVISION', 'EN_REVISION'],
    ['Observado', 'OBSERVADO'],
    ['RECHAZADO', 'OBSERVADO'],
    ['Entregado', 'ENTREGADO'],
    ['Liquidado', 'LIQUIDADO'],
    ['Anulado', 'ANULADO'],
    ['PENDIENTE', 'EN_DESARROLLO'],
    ['En_Desarrollo', 'EN_DESARROLLO'],
    ['', 'EN_DESARROLLO'],
    [null, 'EN_DESARROLLO'],
    [undefined, 'EN_DESARROLLO'],
    ['algo raro', 'EN_DESARROLLO'],
  ])('%s -> %s', (texto, esperado) => {
    expect(estadoPptoDeTexto(texto)).toBe(esperado);
  });

  it('el texto legado de cada estado vuelve al mismo estado (ida y vuelta)', () => {
    for (const e of ['EN_DESARROLLO', 'EN_REVISION', 'OBSERVADO', 'APROBADO', 'ENTREGADO', 'LIQUIDADO', 'ANULADO'] as const) {
      expect(estadoPptoDeTexto(textoLegado(e))).toBe(e);
      expect(estadoPptoDeTexto(textoEstadoCc(e))).toBe(e);
    }
  });
});

describe('estadoMasAvanzado', () => {
  it('toma el más avanzado e ignora los anulados', () => {
    expect(estadoMasAvanzado(['EN_DESARROLLO', 'EN_REVISION'])).toBe('EN_REVISION');
    expect(estadoMasAvanzado(['APROBADO', 'LIQUIDADO', 'EN_REVISION'])).toBe('LIQUIDADO');
    expect(estadoMasAvanzado(['ANULADO', 'EN_DESARROLLO'])).toBe('EN_DESARROLLO');
    expect(estadoMasAvanzado(['OBSERVADO', 'EN_REVISION'])).toBe('EN_REVISION');
  });

  it('sin estados vigentes devuelve null', () => {
    expect(estadoMasAvanzado([])).toBeNull();
    expect(estadoMasAvanzado(['ANULADO'])).toBeNull();
  });
});

describe('esAprobado / esAdicional', () => {
  it('aprobado, entregado y liquidado cuentan como aprobados', () => {
    expect(esAprobado('APROBADO')).toBe(true);
    expect(esAprobado('ENTREGADO')).toBe(true);
    expect(esAprobado('LIQUIDADO')).toBe(true);
    expect(esAprobado('EN_REVISION')).toBe(false);
    expect(esAprobado(null)).toBe(false);
  });

  it('el adicional se reconoce por el tipo y, sin tipo, por el concepto', () => {
    expect(esAdicional('Adicional')).toBe(true);
    expect(esAdicional('Principal')).toBe(false);
    expect(esAdicional(null, 'Adicional #2')).toBe(true);
    expect(esAdicional('Principal', 'Adicional #2')).toBe(false);
    expect(esAdicional(null, null)).toBe(false);
  });
});
