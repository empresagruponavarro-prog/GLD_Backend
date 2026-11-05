import { situacionPresupuestoObra, type PresupuestoDeObra } from './presupuesto-aprobado.js';

const ppto = (estado: string, tipoPpto: string | null = 'Principal', concepto: string | null = null): PresupuestoDeObra => ({ tipoPpto, concepto, estado });

describe('situacionPresupuestoObra (S-05, SP-19)', () => {
  it('sin presupuesto (obra cargada desde el Excel) no se bloquea', () => {
    expect(situacionPresupuestoObra([])).toBe('SIN_PRESUPUESTO');
  });

  it('los anulados no cuentan: solo anulados es lo mismo que no tener presupuesto', () => {
    expect(situacionPresupuestoObra([ppto('ANULADO')])).toBe('SIN_PRESUPUESTO');
  });

  it('con un Principal aprobado, entregado o liquidado la obra puede avanzar', () => {
    expect(situacionPresupuestoObra([ppto('APROBADO')])).toBe('APROBADO');
    expect(situacionPresupuestoObra([ppto('ENTREGADO')])).toBe('APROBADO');
    expect(situacionPresupuestoObra([ppto('LIQUIDADO')])).toBe('APROBADO');
  });

  it('con presupuesto pero sin Principal aprobado queda pendiente (bloquea)', () => {
    expect(situacionPresupuestoObra([ppto('EN_DESARROLLO')])).toBe('PENDIENTE');
    expect(situacionPresupuestoObra([ppto('EN_REVISION'), ppto('OBSERVADO')])).toBe('PENDIENTE');
  });

  it('un adicional aprobado no reemplaza al Principal', () => {
    expect(situacionPresupuestoObra([ppto('EN_REVISION'), ppto('APROBADO', 'Adicional')])).toBe('PENDIENTE');
    expect(situacionPresupuestoObra([ppto('APROBADO', null, 'Adicional #1')])).toBe('PENDIENTE');
  });

  it('CC 758 (tres Principales aprobados y un adicional) puede avanzar', () => {
    expect(situacionPresupuestoObra([ppto('APROBADO'), ppto('APROBADO'), ppto('APROBADO'), ppto('APROBADO', 'Adicional')])).toBe('APROBADO');
  });

  it('una versión nueva en desarrollo no quita la aprobación del Principal vigente', () => {
    expect(situacionPresupuestoObra([ppto('APROBADO'), ppto('EN_DESARROLLO')])).toBe('APROBADO');
  });
});
