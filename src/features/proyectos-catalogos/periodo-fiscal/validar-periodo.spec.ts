import { errorDePeriodo } from './validar-periodo.js';

const ACTIVOS = [2024, 2025, 2026, 2027];

describe('proyectos-catalogos / errorDePeriodo', () => {
  it('sin periodo no valida nada', () => {
    expect(errorDePeriodo(null, '2026-03-01', ACTIVOS)).toBeNull();
    expect(errorDePeriodo(undefined, null, ACTIVOS)).toBeNull();
  });

  it('acepta un año activo, con o sin fecha de inicio', () => {
    expect(errorDePeriodo(2027, null, ACTIVOS)).toBeNull();
    expect(errorDePeriodo(2026, '2026-11-05', ACTIVOS)).toBeNull();
  });

  it('rechaza un año que no está activo y lista los activos', () => {
    expect(errorDePeriodo(2023, null, ACTIVOS)).toBe('El periodo 2023 no está activo (periodos activos: 2024, 2025, 2026, 2027)');
    expect(errorDePeriodo(2030, '2030-01-01', [])).toContain('ninguno');
  });

  it('exige que el periodo sea el año de la fecha de inicio', () => {
    expect(errorDePeriodo(2026, '2027-01-02', ACTIVOS)).toBe('El periodo (2026) debe ser el año de la fecha de inicio (2027)');
  });

  it('acepta la fecha en formato ISO con hora', () => {
    expect(errorDePeriodo(2026, '2026-09-14T00:00:00.000Z', ACTIVOS)).toBeNull();
  });

  it('un año inactivo se reporta antes que el desfase con la fecha', () => {
    expect(errorDePeriodo(2020, '2026-01-01', ACTIVOS)).toContain('no está activo');
  });
});
