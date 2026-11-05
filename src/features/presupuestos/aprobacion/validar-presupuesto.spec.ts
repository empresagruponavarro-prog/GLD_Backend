import { planificarLimpieza, validarPresupuesto, type FasePresupuesto } from './validar-presupuesto.js';

const item = (id: number, cantidad: number, costoUnitario: number) => ({ id, cantidad, costoUnitario });

/** D-09: «Implementación» con LAPICERO 12 × 2 y BARRA DE CONSTRUCCIÓN 10 × 400. */
const implementacion: FasePresupuesto = {
  id: 1,
  nombre: 'IMPLEMENTACIÓN',
  costoDirecto: 4024,
  categorias: [{ id: 10, nombre: 'MATERIALES', items: [item(100, 12, 2), item(101, 10, 400)] }],
};

describe('validarPresupuesto (S-07)', () => {
  it('un presupuesto completo no tiene problemas', () => {
    expect(validarPresupuesto([implementacion])).toEqual([]);
  });

  it('sin fases no se puede aprobar', () => {
    expect(validarPresupuesto([]).map((p) => p.codigo)).toEqual(['SIN_FASES']);
  });

  it('D-09: una fase con monto escrito a mano y sin ítems («Muros y tabiques», S/ 200) no se aprueba', () => {
    const muros: FasePresupuesto = { id: 2, nombre: 'MUROS Y TABIQUES', costoDirecto: 200, categorias: [] };
    const problemas = validarPresupuesto([implementacion, muros]);
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatchObject({ codigo: 'FASE_SIN_CATEGORIAS', idFase: 2 });
    expect(problemas[0].mensaje).toContain('S/ 200.00');
    expect(problemas[0].mensaje).toContain('suma de sus ítems');
  });

  it('una fase sin categorías y sin monto se reporta sin hablar de monto manual', () => {
    const vacia: FasePresupuesto = { id: 3, nombre: 'PINTURA', costoDirecto: 0, categorias: [] };
    const [p] = validarPresupuesto([vacia]);
    expect(p.codigo).toBe('FASE_SIN_CATEGORIAS');
    expect(p.mensaje).toBe('La fase «PINTURA» no tiene categorías');
  });

  it('D-10: las categorías de la plantilla sin ítems bloquean la aprobación', () => {
    const aruma: FasePresupuesto = {
      id: 4,
      nombre: 'ARUMA',
      costoDirecto: 0,
      categorias: ['PRELIMINARES', 'DESMONTAJE', 'FACHADA', 'PUERTAS'].map((nombre, i) => ({ id: 40 + i, nombre, items: [] })),
    };
    const problemas = validarPresupuesto([aruma]);
    expect(problemas.map((p) => p.codigo)).toEqual(Array(4).fill('CATEGORIA_SIN_ITEMS'));
    expect(problemas.map((p) => p.idCategoria)).toEqual([40, 41, 42, 43]);
  });

  it('un ítem con cantidad o costo en cero o negativo está vacío', () => {
    const fase: FasePresupuesto = {
      id: 5,
      nombre: 'F',
      costoDirecto: 0,
      categorias: [{ id: 50, nombre: 'C', items: [item(1, 0, 10), item(2, 5, 0), item(3, -1, 4), item(4, 2, 3)] }],
    };
    const problemas = validarPresupuesto([fase]);
    expect(problemas.map((p) => p.idItem)).toEqual([1, 2, 3]);
    expect(problemas.every((p) => p.codigo === 'ITEM_VACIO')).toBe(true);
  });
});

describe('planificarLimpieza', () => {
  it('borra los ítems vacíos y las categorías que se quedan sin ítems, y conserva lo completo', () => {
    const fases: FasePresupuesto[] = [
      implementacion,
      {
        id: 2,
        nombre: 'ARUMA',
        costoDirecto: 0,
        categorias: [
          { id: 20, nombre: 'FACHADA', items: [item(200, 0, 0)] }, // solo ítems vacíos: se va entera
          { id: 21, nombre: 'PUERTAS', items: [] }, // sin ítems: se va
          { id: 22, nombre: 'PISOS', items: [item(220, 4, 10), item(221, 0, 5)] }, // se queda con un ítem
        ],
      },
    ];
    expect(planificarLimpieza(fases)).toEqual({
      itemsABorrar: [200, 221],
      categoriasABorrar: [20, 21],
      fasesSinCategorias: [],
    });
  });

  it('una fase que se queda sin categorías se reporta pero no se borra', () => {
    const fases: FasePresupuesto[] = [
      { id: 7, nombre: 'SOLO VACÍA', costoDirecto: 0, categorias: [{ id: 70, nombre: 'X', items: [item(700, 0, 0)] }] },
      { id: 8, nombre: 'MANUAL', costoDirecto: 200, categorias: [] },
    ];
    const plan = planificarLimpieza(fases);
    expect(plan.categoriasABorrar).toEqual([70]);
    expect(plan.fasesSinCategorias).toEqual([
      { id: 7, nombre: 'SOLO VACÍA' },
      { id: 8, nombre: 'MANUAL' },
    ]);
  });

  it('un presupuesto completo no pierde nada', () => {
    expect(planificarLimpieza([implementacion])).toEqual({ itemsABorrar: [], categoriasABorrar: [], fasesSinCategorias: [] });
  });
});
