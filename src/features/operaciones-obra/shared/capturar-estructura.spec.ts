import { planificarCaptura, type CategoriaOrigen, type FaseOrigen } from './capturar-estructura.js';

const fase = (id: number, nombre: string | null): FaseOrigen => ({ id, idPresupuestoDetalle: `DF-${id}`, nombre });
const cat = (id: number, deFase: number, nombre: string | null, costo: string | null): CategoriaOrigen => ({
  id,
  idPresupuestoDetalle: `DF-${deFase}`,
  nombre,
  costoDirecto: costo,
});
const vacia = { itemsPartida: [] as string[], categoriasCapturadas: new Set<number>() };

describe('planificarCaptura · principal', () => {
  const fases = [fase(2, 'OBRA GRUESA'), fase(1, 'IMPLEMENTACIÓN')];
  const categorias = [cat(12, 1, 'EQUIPOS', '200.00'), cat(11, 1, 'MATERIALES', '4024.00'), cat(20, 2, 'ESTRUCTURA', '1500.50')];

  it('una partida por fase y una subpartida por categoría, en el orden del presupuesto y con su monto', () => {
    const plan = planificarCaptura({ fases, categorias, modo: 'principal', existente: vacia });
    expect(plan.map((p) => [p.item, p.nombre, p.idFase, p.tipo])).toEqual([
      ['01', 'IMPLEMENTACIÓN', 1, 'CONTRACTUAL'],
      ['02', 'OBRA GRUESA', 2, 'CONTRACTUAL'],
    ]);
    expect(plan[0].subpartidas.map((s) => [s.item, s.nombre, s.idCategoria, s.monto])).toEqual([
      ['01.01', 'MATERIALES', 11, '4024.00'],
      ['01.02', 'EQUIPOS', 12, '200.00'],
    ]);
    expect(plan[1].subpartidas.map((s) => [s.item, s.monto])).toEqual([['02.01', '1500.50']]);
    expect(plan.map((p) => p.orden)).toEqual([1, 2]);
  });

  it('usa un nombre por defecto cuando falta el del catálogo y recorta a 150 caracteres', () => {
    const plan = planificarCaptura({
      fases: [fase(1, null), fase(2, 'X'.repeat(200))],
      categorias: [cat(1, 1, null, null)],
      modo: 'principal',
      existente: vacia,
    });
    expect(plan[0].nombre).toBe('Fase 1');
    expect(plan[0].subpartidas[0]).toMatchObject({ nombre: 'Partida 01.01', monto: null });
    expect(plan[1].nombre).toHaveLength(150);
  });

  it('una fase sin categorías igual genera su partida (como la importación manual)', () => {
    const plan = planificarCaptura({ fases: [fase(1, 'SOLA')], categorias: [], modo: 'principal', existente: vacia });
    expect(plan).toHaveLength(1);
    expect(plan[0].subpartidas).toEqual([]);
  });
});

describe('planificarCaptura · adicional (SP-14)', () => {
  it('agrega partidas ADICIONAL a continuación de las existentes, sin tocarlas', () => {
    const plan = planificarCaptura({
      fases: [fase(5, 'FACHADA')],
      categorias: [cat(50, 5, 'PINTURA', '300.00')],
      modo: 'adicional',
      existente: { itemsPartida: ['01', '02', '03'], categoriasCapturadas: new Set([10, 11]) },
    });
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ item: '04', orden: 4, tipo: 'ADICIONAL' });
    expect(plan[0].subpartidas[0]).toMatchObject({ item: '04.01', idCategoria: 50, monto: '300.00' });
  });

  it('la partida del adicional se mantiene aparte aunque la fase ya exista en el Principal', () => {
    // La fase 1 del adicional es «MUROS», igual que la del Principal: no se fusionan.
    const plan = planificarCaptura({
      fases: [fase(9, 'MUROS')],
      categorias: [cat(90, 9, 'TABIQUES', '120.00')],
      modo: 'adicional',
      existente: { itemsPartida: ['01'], categoriasCapturadas: new Set([1]) },
    });
    expect(plan[0]).toMatchObject({ item: '02', nombre: 'MUROS', tipo: 'ADICIONAL' });
  });

  it('ignora los ítems no numéricos al numerar (obras que vinieron del Excel)', () => {
    const plan = planificarCaptura({
      fases: [fase(1, 'A')],
      categorias: [cat(1, 1, 'B', '1')],
      modo: 'adicional',
      existente: { itemsPartida: ['A', '1.1', '07'], categoriasCapturadas: new Set() },
    });
    expect(plan[0].item).toBe('08');
  });
});

describe('planificarCaptura · idempotencia', () => {
  it('no vuelve a crear categorías ya capturadas ni fases cuyo contenido ya está capturado', () => {
    const fases = [fase(1, 'F1'), fase(2, 'F2')];
    const categorias = [cat(11, 1, 'A', '10'), cat(12, 1, 'B', '20'), cat(21, 2, 'C', '30')];
    const plan = planificarCaptura({
      fases,
      categorias,
      modo: 'adicional',
      existente: { itemsPartida: ['01'], categoriasCapturadas: new Set([11, 12]) },
    });
    // F1 ya está completa; solo falta F2.
    expect(plan.map((p) => p.idFase)).toEqual([2]);
    expect(plan[0].item).toBe('02');
  });

  it('si falta una sola categoría de una fase, se crea su partida con esa categoría', () => {
    const plan = planificarCaptura({
      fases: [fase(1, 'F1')],
      categorias: [cat(11, 1, 'A', '10'), cat(12, 1, 'B', '20')],
      modo: 'adicional',
      existente: { itemsPartida: ['01'], categoriasCapturadas: new Set([11]) },
    });
    expect(plan[0].subpartidas.map((s) => s.idCategoria)).toEqual([12]);
  });

  it('repetir el cálculo con todo capturado no produce nada', () => {
    const plan = planificarCaptura({
      fases: [fase(1, 'F1')],
      categorias: [cat(11, 1, 'A', '10')],
      modo: 'principal',
      existente: { itemsPartida: ['01'], categoriasCapturadas: new Set([11]) },
    });
    expect(plan).toEqual([]);
  });
});
