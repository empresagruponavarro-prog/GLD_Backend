import type { ObraEntrada } from './control-avance/control-avance.types.js';
import { avanceAlCorte, avanceDeLinea } from './avances-subfase.js';

// Obra que empieza un lunes (2026-11-02): la semana 1 es 02-08 de noviembre, la 2 es 09-15, la 3 es 16-22.
const entrada = (avance: (number | null)[]): ObraEntrada => ({
  estado: 'EN_EJECUCION',
  inicio: '2026-11-02',
  fin: '2026-12-05',
  partidas: [{ item: '1', nombre: 'P', subpartidas: [{ item: '1.01', nombre: 'S', inicio: '2026-11-02', fin: '2026-11-30', avance }] }],
});

describe('avanceAlCorte', () => {
  it('suma lo registrado hasta la semana del corte, sin mirar lo posterior', () => {
    const e = entrada([20, 30, 10]);
    expect(avanceAlCorte(e, '2026-11-08').get('1.01')).toBe(20); // fin de la semana 1
    expect(avanceAlCorte(e, '2026-11-15').get('1.01')).toBe(50); // semana 2
    expect(avanceAlCorte(e, '2026-11-22').get('1.01')).toBe(60); // semana 3
  });

  it('un corte anterior al inicio de la obra no tiene avance', () => {
    expect(avanceAlCorte(entrada([20]), '2026-10-20').get('1.01')).toBe(0);
  });

  it('99,5 % o más cuenta como 100 y nunca pasa de 100', () => {
    expect(avanceAlCorte(entrada([60, 39.6]), '2026-11-15').get('1.01')).toBe(100);
    expect(avanceAlCorte(entrada([80, 60]), '2026-11-15').get('1.01')).toBe(100);
  });

  it('semanas sin dato valen 0', () => {
    expect(avanceAlCorte(entrada([null, 25]), '2026-11-08').get('1.01')).toBe(0);
  });
});

describe('avanceDeLinea', () => {
  const avances = new Map([[20, 60]]);

  it('usa la subfase propia si la obra la tiene', () => {
    expect(avanceDeLinea(20, [99], avances)).toBe(60);
  });

  it('si la obra ya no tiene su subfase, toma la de la versión que la reemplazó', () => {
    expect(avanceDeLinea(10, [10, 20], avances)).toBe(60);
  });

  it('la propia gana a las equivalentes', () => {
    expect(avanceDeLinea(10, [20], new Map([[10, 5], [20, 60]]))).toBe(5);
  });

  it('sin subfase propia, usa las equivalentes; sin nada, no hay dato', () => {
    expect(avanceDeLinea(null, [20], avances)).toBe(60);
    expect(avanceDeLinea(null, [], avances)).toBeNull();
    expect(avanceDeLinea(10, [11], avances)).toBeNull();
  });
});
