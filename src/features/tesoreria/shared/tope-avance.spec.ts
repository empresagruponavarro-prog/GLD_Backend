import { avanceDeLineas, disponibleAvance, montoSugerido, superaTope, topeAvance } from './tope-avance.js';

describe('tesorería / tope de pago por avance de obra', () => {
  it('el avance de la orden pondera el de cada línea por su monto', () => {
    expect(avanceDeLineas([{ monto: 600, avance: 50 }, { monto: 400, avance: 0 }])).toBe(30);
    expect(avanceDeLineas([{ monto: 100, avance: 100 }])).toBe(100);
  });

  it('una línea sin subpartida en el control de avance cuenta con avance 0 (pero pesa)', () => {
    expect(avanceDeLineas([{ monto: 500, avance: 80 }, { monto: 500, avance: null }])).toBe(40);
  });

  it('sin líneas, sin monto o con valores fuera de rango, el avance es 0..100', () => {
    expect(avanceDeLineas([])).toBe(0);
    expect(avanceDeLineas([{ monto: 0, avance: 90 }])).toBe(0);
    expect(avanceDeLineas([{ monto: 10, avance: 250 }, { monto: 10, avance: -30 }])).toBe(50);
  });

  it('sin avance el tope es el adelanto', () => {
    expect(topeAvance(1000, 30, [{ monto: 1000, avance: 0 }])).toEqual({ adelantoPct: 30, avancePct: 0, pctAplicado: 30, tope: 300 });
  });

  it('con más avance que adelanto el tope sigue al avance', () => {
    expect(topeAvance(1000, 30, [{ monto: 1000, avance: 55 }])).toMatchObject({ avancePct: 55, pctAplicado: 55, tope: 550 });
  });

  it('una obra sin control de avance solo libera el adelanto; sin adelanto ni avance el tope es 0', () => {
    expect(topeAvance(1000, 20, [])).toMatchObject({ pctAplicado: 20, tope: 200 });
    expect(topeAvance(1000, 0, [{ monto: 1000, avance: null }]).tope).toBe(0);
  });

  it('nunca supera el neto ni usa un neto negativo', () => {
    expect(topeAvance(1000, 150, []).tope).toBe(1000);
    expect(topeAvance(-5, 50, []).tope).toBe(0);
  });

  it('el disponible descuenta lo pagado y lo programado, sin bajar de cero', () => {
    expect(disponibleAvance(550, 300, 100)).toBe(150);
    expect(disponibleAvance(300, 300, 100)).toBe(0);
  });

  it('el monto sugerido es el adelanto al inicio y después lo que el avance ya liberó', () => {
    expect(montoSugerido(1000, 30, 300, 0, 0)).toBe(300);
    expect(montoSugerido(1000, 30, 550, 300, 0)).toBe(250);
    expect(montoSugerido(1000, 30, 550, 300, 250)).toBe(0);
    expect(montoSugerido(1000, 0, 0, 0, 0)).toBe(0);
  });

  it('superaTope: pasar el tope por más de un centavo, sí; llegar justo, no', () => {
    expect(superaTope(550, 300, 0, 250)).toBe(false);
    expect(superaTope(550, 300, 0, 250.01)).toBe(true);
    expect(superaTope(550, 300, 100, 150.004)).toBe(false);
  });
});
