import { leerModoAlta } from './modo-alta.js';

describe('leerModoAlta', () => {
  it('por defecto es manual: aprobar un presupuesto no crea contratos', () => {
    expect(leerModoAlta({})).toBe('manual');
    expect(leerModoAlta({ VALORIZACIONES_ALTA: '' })).toBe('manual');
    expect(leerModoAlta({ VALORIZACIONES_ALTA: 'otra-cosa' })).toBe('manual');
  });

  it('automatica se reconoce sin importar mayúsculas ni espacios', () => {
    expect(leerModoAlta({ VALORIZACIONES_ALTA: 'automatica' })).toBe('automatica');
    expect(leerModoAlta({ VALORIZACIONES_ALTA: ' AUTOMATICA ' })).toBe('automatica');
  });
});
