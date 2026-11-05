import { evaluarLiquidacion, type EntradaLiquidacion } from './liquidacion.js';

const completa = { total: 2, obligatorios: 2, entregados_obligatorios: 2, faltantes: [], completo: true };
const entrada = (extra: Partial<EntradaLiquidacion> = {}): EntradaLiquidacion => ({
  estadoCc: 'POR LIQUIDAR',
  fechaFinReal: '2026-11-01',
  avance: { configurada: true, real: 100 },
  planos: completa,
  ...extra,
});

describe('evaluarLiquidacion (S-11, DG6)', () => {
  it('con todo cumplido se puede liquidar', () => {
    const r = evaluarLiquidacion(entrada());
    expect(r).toMatchObject({ liquidada: false, puedeLiquidar: true });
    expect(r.requisitos.every((x) => x.cumplido)).toBe(true);
  });

  it('el centro de costo debe estar POR LIQUIDAR', () => {
    const r = evaluarLiquidacion(entrada({ estadoCc: 'ABIERTO' }));
    expect(r.puedeLiquidar).toBe(false);
    expect(r.requisitos.find((x) => x.codigo === 'ESTADO')).toMatchObject({ cumplido: false, mensaje: expect.stringContaining('POR LIQUIDAR') });
  });

  it('la ejecución debe llegar al 100 %; el 99,6 % cuenta como 99', () => {
    const r = evaluarLiquidacion(entrada({ avance: { configurada: true, real: 99.6 } }));
    expect(r.puedeLiquidar).toBe(false);
    expect(r.requisitos.find((x) => x.codigo === 'AVANCE')?.mensaje).toContain('99 %');
  });

  it('una obra fuera del control de avance no tiene avance que exigir', () => {
    const r = evaluarLiquidacion(entrada({ avance: { configurada: false, real: 0 } }));
    expect(r.requisitos.find((x) => x.codigo === 'AVANCE')).toMatchObject({ cumplido: true });
    expect(r.puedeLiquidar).toBe(true);
  });

  it('hace falta la fecha de fin real', () => {
    const r = evaluarLiquidacion(entrada({ fechaFinReal: null }));
    expect(r.puedeLiquidar).toBe(false);
    expect(r.requisitos.find((x) => x.codigo === 'FIN_REAL')?.mensaje).toBe('Registre la fecha de fin real');
  });

  it('faltan planos obligatorios: se bloquea y se dice cuáles', () => {
    const r = evaluarLiquidacion(
      entrada({ planos: { total: 2, obligatorios: 2, entregados_obligatorios: 1, completo: false, faltantes: [{ id_tipo_plano: 2, codigo: 'EST', nombre: 'ESTRUCTURAS' }] } }),
    );
    expect(r.puedeLiquidar).toBe(false);
    expect(r.requisitos.find((x) => x.codigo === 'PLANOS')?.mensaje).toBe('Faltan 1 plano(s) obligatorio(s): ESTRUCTURAS');
  });

  it('una obra ya cerrada está liquidada y no se liquida de nuevo', () => {
    const r = evaluarLiquidacion(entrada({ estadoCc: 'CERRADO' }));
    expect(r).toMatchObject({ liquidada: true, puedeLiquidar: false });
  });
});
