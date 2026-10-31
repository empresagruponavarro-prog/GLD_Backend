import { esSinLeer, leerTipos } from './avisos.handler.js';

const ahora = new Date('2026-10-30T12:00:00.000Z');

describe('avisos · lectura y preferencias (RF-OP-49)', () => {
  it('leerTipos devuelve null (todos) si está vacío y descarta tipos desconocidos', () => {
    expect(leerTipos(null)).toBeNull();
    expect(leerTipos('')).toBeNull();
    expect(leerTipos('SITUACION,VENCIDO')).toEqual(['SITUACION', 'VENCIDO']);
    expect(leerTipos('SITUACION,NO_EXISTE')).toEqual(['SITUACION']);
    expect(leerTipos('NO_EXISTE')).toBeNull();
  });

  it('con marca de lectura, solo cuentan los posteriores', () => {
    const marca = '2026-10-30T10:00:00.000Z';
    expect(esSinLeer({ tipo: 'SITUACION', created_at: '2026-10-30T10:00:01.000Z' }, marca, null, ahora)).toBe(true);
    expect(esSinLeer({ tipo: 'SITUACION', created_at: '2026-10-30T09:59:59.000Z' }, marca, null, ahora)).toBe(false);
  });

  it('sin marca solo cuentan los últimos 14 días', () => {
    expect(esSinLeer({ tipo: 'ESTADO', created_at: '2026-10-20T00:00:00.000Z' }, null, null, ahora)).toBe(true);
    expect(esSinLeer({ tipo: 'ESTADO', created_at: '2026-10-01T00:00:00.000Z' }, null, null, ahora)).toBe(false);
  });

  it('con tipos elegidos, los demás no cuentan', () => {
    const e = { tipo: 'AVANCE', created_at: '2026-10-30T11:00:00.000Z' };
    expect(esSinLeer(e, null, ['SITUACION'], ahora)).toBe(false);
    expect(esSinLeer(e, null, ['AVANCE', 'SITUACION'], ahora)).toBe(true);
  });
});
