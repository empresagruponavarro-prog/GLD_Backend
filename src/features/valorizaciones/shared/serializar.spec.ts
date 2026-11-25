import { m2, sumarMeses } from './serializar.js';

describe('sumarMeses', () => {
  it('suma meses calendario', () => {
    expect(sumarMeses('2026-11-24', 3)).toBe('2027-02-24');
    expect(sumarMeses('2026-01-15', 0)).toBe('2026-01-15');
  });

  it('un día que no existe en el mes destino queda en el último día del mes', () => {
    expect(sumarMeses('2026-11-30', 3)).toBe('2027-02-28');
    expect(sumarMeses('2027-11-30', 3)).toBe('2028-02-29'); // año bisiesto
    expect(sumarMeses('2026-08-31', 1)).toBe('2026-09-30');
  });

  it('cruza el año', () => {
    expect(sumarMeses('2026-12-31', 2)).toBe('2027-02-28');
  });
});

describe('m2', () => {
  it('importe con 2 decimales', () => {
    expect(m2(25)).toBe('25.00');
    expect(m2(33.335)).toBe('33.34');
    expect(m2(0)).toBe('0.00');
  });
});
