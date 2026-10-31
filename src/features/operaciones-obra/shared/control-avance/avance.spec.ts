import { desviacion, promedioPonderado, realAcumulado, realHastaSemana, tieneAvance, truncar } from './avance.js';

describe('avance · RC-06 real acumulado', () => {
  it('sin avance escrito devuelve null (celda vacía), pero un 0 sí es un reporte', () => {
    expect(realAcumulado(null)).toBeNull();
    expect(realAcumulado([])).toBeNull();
    expect(realAcumulado([null, null])).toBeNull();
    expect(realAcumulado([0])).toBe(0);
  });

  it('es la suma de lo avanzado cada semana, no el último valor', () => {
    expect(realAcumulado([15, 45, 40])).toBe(100);
    expect(realAcumulado([15, 45])).toBe(60);
    expect(realAcumulado([33.3, 66.7])).toBe(100);
  });

  it('desde 99,5 se toma 100; tope 100', () => {
    expect(realAcumulado([99.5])).toBe(100);
    expect(realAcumulado([99.4])).toBe(99.4);
    expect(realAcumulado([60, 60])).toBe(100);
  });

  it('ignora huecos y valores no numéricos', () => {
    expect(realAcumulado([10, null, 20, Number.NaN])).toBe(30);
  });

  it('tieneAvance', () => {
    expect(tieneAvance(undefined)).toBe(false);
    expect(tieneAvance([null])).toBe(false);
    expect(tieneAvance([0])).toBe(true);
  });
});

describe('avance · real hasta una semana (Curva S)', () => {
  const a = [20, 30, null, 25];
  it('suma solo las primeras N semanas', () => {
    expect(realHastaSemana(a, 1)).toBe(20);
    expect(realHastaSemana(a, 2)).toBe(50);
    expect(realHastaSemana(a, 3)).toBe(50);
    expect(realHastaSemana(a, 4)).toBe(75);
  });
  it('con 99,5 o más llega a 100 y nunca lo pasa', () => {
    expect(realHastaSemana([99.6], 1)).toBe(100);
    expect(realHastaSemana([80, 80], 2)).toBe(100);
  });
  it('sin avance = 0', () => {
    expect(realHastaSemana(null, 3)).toBe(0);
  });
});

describe('avance · RC-10 agregación ponderada', () => {
  it('pondera por peso (días laborables), no por cantidad de filas', () => {
    expect(promedioPonderado([{ peso: 2, valor: 100 }, { peso: 6, valor: 0 }])).toBe(25);
    expect(promedioPonderado([{ peso: 1, valor: 100 }, { peso: 1, valor: 0 }])).toBe(50);
  });
  it('sin peso = 0', () => {
    expect(promedioPonderado([])).toBe(0);
  });
  it('truncar: 99,6 se muestra 99; solo el 100 exacto es 100', () => {
    expect(truncar(99.6)).toBe(99);
    expect(truncar(99.9999999)).toBe(100); // ruido de punto flotante
    expect(truncar(100)).toBe(100);
    expect(truncar(79.4)).toBe(79);
  });
});

describe('avance · RC-11 desviación', () => {
  it('real − programado en pp', () => {
    expect(desviacion(60, 80)).toBe(-20);
    expect(desviacion(80, 80)).toBe(0);
    expect(desviacion(90, 80)).toBe(10);
  });
});
