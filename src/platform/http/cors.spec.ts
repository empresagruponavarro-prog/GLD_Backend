import { ORIGENES_CORS_DEFECTO, origenesCors } from './cors.js';

describe('origenesCors', () => {
  it('sin CORS_ORIGENES usa el frontend del servidor y el de desarrollo', () => {
    expect(origenesCors({})).toEqual(['http://192.168.18.231', 'http://localhost:4200']);
    expect(origenesCors({ CORS_ORIGENES: '  ' })).toEqual([...ORIGENES_CORS_DEFECTO]);
  });

  it('lee la lista separada por comas, sin espacios ni barra final', () => {
    expect(origenesCors({ CORS_ORIGENES: 'http://gld.empresa.pe/ , http://localhost:4200' })).toEqual([
      'http://gld.empresa.pe',
      'http://localhost:4200',
    ]);
  });

  it('nunca acepta cualquier origen', () => {
    expect(origenesCors({ CORS_ORIGENES: ',,' })).not.toContain('*');
  });
});
