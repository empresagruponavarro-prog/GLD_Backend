import { planificarCopia, resumenPlanos, type PlanoRequeridoItem } from './planos-requeridos.js';

const item = (id: number, obligatorio: boolean, entregado: boolean): PlanoRequeridoItem => ({
  id_tipo_plano: id,
  codigo: `P${id}`,
  nombre: `PLANO ${id}`,
  obligatorio,
  entregado,
  entregado_por: null,
  entregado_en: null,
});

describe('resumenPlanos (S-08)', () => {
  it('una obra sin lista exigida está completa', () => {
    expect(resumenPlanos([])).toEqual({ total: 0, obligatorios: 0, entregados_obligatorios: 0, faltantes: [], completo: true });
  });

  it('falta un plano obligatorio sin entregar: no está completa y se dice cuál', () => {
    const r = resumenPlanos([item(1, true, true), item(2, true, false), item(3, false, false)]);
    expect(r).toMatchObject({ total: 3, obligatorios: 2, entregados_obligatorios: 1, completo: false });
    expect(r.faltantes).toEqual([{ id_tipo_plano: 2, codigo: 'P2', nombre: 'PLANO 2' }]);
  });

  it('los opcionales sin entregar no bloquean', () => {
    expect(resumenPlanos([item(1, true, true), item(2, false, false)]).completo).toBe(true);
  });

  it('con todos los obligatorios entregados está completa', () => {
    expect(resumenPlanos([item(1, true, true), item(2, true, true)])).toMatchObject({ completo: true, faltantes: [] });
  });
});

describe('planificarCopia', () => {
  const actual = (id: number, tipo: number, obligatorio: boolean, entregado: boolean) => ({ id, id_tipo_plano: tipo, obligatorio, entregado });

  it('una obra sin lista recibe todo lo que pide el tipo', () => {
    expect(planificarCopia([{ id_tipo_plano: 1, obligatorio: true }, { id_tipo_plano: 2, obligatorio: false }], [])).toEqual({
      crear: [{ id_tipo_plano: 1, obligatorio: true }, { id_tipo_plano: 2, obligatorio: false }],
      actualizar: [],
      borrar: [],
    });
  });

  it('copiar de nuevo el mismo tipo no cambia nada', () => {
    const plan = planificarCopia([{ id_tipo_plano: 1, obligatorio: true }], [actual(10, 1, true, true)]);
    expect(plan).toEqual({ crear: [], actualizar: [], borrar: [] });
  });

  it('al cambiar de tipo conserva los checks hechos de lo que sigue pidiéndose', () => {
    const plan = planificarCopia(
      [{ id_tipo_plano: 1, obligatorio: true }, { id_tipo_plano: 3, obligatorio: true }],
      [actual(10, 1, true, true), actual(11, 2, true, false)],
    );
    expect(plan.crear).toEqual([{ id_tipo_plano: 3, obligatorio: true }]);
    expect(plan.borrar).toEqual([11]); // ya no se pide y no estaba entregado
    expect(plan.actualizar).toEqual([]);
  });

  it('un plano entregado que el nuevo tipo ya no pide se conserva', () => {
    expect(planificarCopia([], [actual(11, 2, true, true), actual(12, 3, true, false)]).borrar).toEqual([12]);
  });

  it('actualiza si el nuevo tipo cambia lo obligatorio', () => {
    expect(planificarCopia([{ id_tipo_plano: 1, obligatorio: false }], [actual(10, 1, true, false)]).actualizar).toEqual([{ id: 10, obligatorio: false }]);
  });

  it('sin tipo de proyecto solo queda lo ya entregado', () => {
    expect(planificarCopia([], [actual(10, 1, true, false), actual(11, 2, true, true)])).toEqual({ crear: [], actualizar: [], borrar: [10] });
  });
});
