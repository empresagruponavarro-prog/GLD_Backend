import { calcularResumenCc } from './sincronizar-cc.js';

describe('calcularResumenCc (DG15)', () => {
  it('sin presupuestos: monto 0 y sin estado', () => {
    expect(calcularResumenCc([])).toEqual({ monto: 0, estado: null });
  });

  it('con aprobados suma solo los aprobados (Principal y adicionales) y toma el estado más avanzado', () => {
    const r = calcularResumenCc([
      { estado: 'APROBADO', costoDirecto: 1000, costoFases: 1000 },
      { estado: 'APROBADO', costoDirecto: 250.5, costoFases: 250.5 }, // adicional aprobado
      { estado: 'EN_REVISION', costoDirecto: 9999, costoFases: 9999 }, // aún no cuenta
    ]);
    expect(r).toEqual({ monto: 1250.5, estado: 'APROBADO' });
  });

  it('sin aprobados suma los vigentes (lo que se está armando)', () => {
    const r = calcularResumenCc([
      { estado: 'EN_DESARROLLO', costoDirecto: 300, costoFases: 300 },
      { estado: 'EN_REVISION', costoDirecto: 200, costoFases: 200 },
    ]);
    expect(r).toEqual({ monto: 500, estado: 'EN_REVISION' });
  });

  it('los anulados no cuentan ni en el monto ni en el estado', () => {
    const r = calcularResumenCc([
      { estado: 'ANULADO', costoDirecto: 5000, costoFases: 5000 },
      { estado: 'EN_DESARROLLO', costoDirecto: 100, costoFases: 100 },
    ]);
    expect(r).toEqual({ monto: 100, estado: 'EN_DESARROLLO' });
    expect(calcularResumenCc([{ estado: 'ANULADO', costoDirecto: 1, costoFases: 1 }])).toEqual({ monto: 0, estado: null });
  });

  it('usa el mayor entre la cabecera y la suma de las fases de cada presupuesto', () => {
    const r = calcularResumenCc([
      { estado: 'APROBADO', costoDirecto: 0, costoFases: 400 }, // cabecera atrasada
      { estado: 'APROBADO', costoDirecto: 600, costoFases: 100 },
    ]);
    expect(r.monto).toBe(1000);
  });

  it('CC 758 (tres Principales aprobados y un adicional): suma los cuatro', () => {
    const r = calcularResumenCc([
      { estado: 'APROBADO', costoDirecto: 54642.44, costoFases: 54642.44 },
      { estado: 'APROBADO', costoDirecto: 16446.45, costoFases: 16446.45 },
      { estado: 'APROBADO', costoDirecto: 3553.3, costoFases: 3553.3 },
      { estado: 'APROBADO', costoDirecto: 12540.2, costoFases: 12540.2 },
    ]);
    expect(r).toEqual({ monto: 87182.39, estado: 'APROBADO' });
  });
});
