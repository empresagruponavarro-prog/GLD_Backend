import type { ObraCargada } from './carga-obra.js';
import type { EstadoObra, ResultadoObra } from './control-avance.types.js';
import { catalogosDe, enAnio, esVigente, filtrarObras, normalizar, ordenarObras, resumirObra, type ObraResumen } from './resumen-portafolio.js';

const persona = (id: number, nombre: string) => ({ id, nombre });
const SIN_EQUIPO = { jefe_proyecto: null, coordinador: null, residente: null, resp_presupuesto: null, resp_procura: null };

/** Resumen mínimo para probar filtros, orden y catálogos. */
function obra(p: Partial<ObraResumen> & { efectivo?: EstadoObra; situacion?: string } = {}): ObraResumen {
  const { efectivo, situacion, ...resto } = p;
  const estado = resto.estado_obra ?? 'EN_EJECUCION';
  return {
    id_centro_costo: 1,
    codigo_obra: 'OP-26-001',
    nombre: 'Tambo Lince',
    cliente: persona(10, 'Tambo'),
    tienda: 'Lince',
    departamento: 'Lima',
    comentario: null,
    equipo: { ...SIN_EQUIPO, jefe_proyecto: persona(100, 'Carlos G.'), coordinador: persona(200, 'Abel Narváez') },
    estado_obra: estado,
    inicio: '2026-09-21',
    fin: '2026-10-24',
    curva: null,
    ...resto,
    resultado: {
      estadoEfectivo: efectivo ?? estado,
      situacion: { clave: 'good', texto: situacion ?? 'A tiempo' },
    } as ObraResumen['resultado'],
  };
}

describe('portafolio · normalizar', () => {
  it('minúsculas, sin tildes y con espacios simples', () => {
    expect(normalizar('  Áncash   Región ')).toBe('ancash region');
    expect(normalizar(null)).toBe('');
  });
});

describe('portafolio · RC-21 vigente y año', () => {
  it('vigente = ni culminada ni cancelada', () => {
    expect(esVigente({ estado_obra: 'EN_EJECUCION' })).toBe(true);
    expect(esVigente({ estado_obra: 'POST_VENTA' })).toBe(true);
    expect(esVigente({ estado_obra: 'SUSPENDIDA' })).toBe(true);
    expect(esVigente({ estado_obra: 'CULMINADO' })).toBe(false);
    expect(esVigente({ estado_obra: 'CANCELADA' })).toBe(false);
  });

  it('el año es el de inicio; con «+ vigentes de años anteriores» suma las abiertas', () => {
    const vieja = { inicio: '2025-11-03', estado_obra: 'EN_EJECUCION' as const };
    const cerrada = { inicio: '2025-11-03', estado_obra: 'CULMINADO' as const };
    expect(enAnio({ inicio: '2026-03-02', estado_obra: 'CULMINADO' }, 2026)).toBe(true);
    expect(enAnio(vieja, 2026)).toBe(true);
    expect(enAnio(vieja, 2026, false)).toBe(false);
    expect(enAnio(cerrada, 2026)).toBe(false); // una culminada solo sale en el año en que estuvo activa
    expect(enAnio({ inicio: '2027-01-04', estado_obra: 'PROXIMO' }, 2026)).toBe(false);
  });
});

describe('portafolio · filtros', () => {
  const lista = [
    obra({ id_centro_costo: 1, nombre: 'Tambo Lince', codigo_obra: 'OP-26-001' }),
    obra({ id_centro_costo: 2, nombre: 'Coolbox Jockey Plaza', codigo_obra: 'OP-26-002', cliente: persona(11, 'Coolbox'), departamento: 'Callao', estado_obra: 'POST_VENTA', equipo: { ...SIN_EQUIPO, jefe_proyecto: persona(101, 'Marifá'), coordinador: persona(201, 'Nicole') } }),
    obra({ id_centro_costo: 3, nombre: 'Aruma Cajamarca', codigo_obra: 'OP-26-003', cliente: persona(12, 'Aruma'), departamento: 'Cajamarca', estado_obra: 'CULMINADO', inicio: '2026-01-12' }),
    obra({ id_centro_costo: 4, nombre: 'Tambo Surco', codigo_obra: 'OP-25-040', inicio: '2025-12-01' }),
    obra({ id_centro_costo: 5, nombre: 'Tambo Ate', estado_obra: 'EN_EJECUCION', efectivo: 'PROXIMO', inicio: '2026-11-02' }),
  ];
  const ids = (f: Parameters<typeof filtrarObras>[1]) => filtrarObras(lista, f).map((o) => o.id_centro_costo);

  it('sin filtros devuelve todo', () => {
    expect(ids({})).toEqual([1, 2, 3, 4, 5]);
  });

  it('por año de inicio, con y sin las vigentes de años anteriores', () => {
    expect(ids({ anio: 2026 })).toEqual([1, 2, 3, 4, 5]); // la 4 (2025) sigue vigente
    expect(ids({ anio: 2026, vigentesAnteriores: false })).toEqual([1, 2, 3, 5]);
    expect(ids({ anio: 2025 })).toEqual([4]);
  });

  it('solo vigentes (pantalla en vivo) excluye las culminadas', () => {
    expect(ids({ soloVigentes: true })).toEqual([1, 2, 4, 5]);
  });

  it('por cliente, jefe y coordinador', () => {
    expect(ids({ cliente: 10 })).toEqual([1, 4, 5]);
    expect(ids({ jefe: 101 })).toEqual([2]);
    expect(ids({ coordinador: 201 })).toEqual([2]);
    expect(ids({ cliente: 999 })).toEqual([]);
  });

  it('por departamento, sin importar tildes ni mayúsculas', () => {
    expect(ids({ departamento: 'callao' })).toEqual([2]);
    expect(ids({ departamento: 'CAJAMARCA' })).toEqual([3]);
  });

  it('por estado EFECTIVO: una «En ejecución» que aún no inicia es «Próximo»', () => {
    expect(ids({ estado: 'PROXIMO' })).toEqual([5]);
    expect(ids({ estado: 'EN_EJECUCION' })).toEqual([1, 4]);
    expect(ids({ estado: 'POST_VENTA' })).toEqual([2]);
  });

  it('búsqueda por nombre o código, sin tildes ni mayúsculas', () => {
    expect(ids({ q: 'jockey' })).toEqual([2]);
    expect(ids({ q: 'op-25' })).toEqual([4]);
    expect(ids({ q: '  TAMBO  ' })).toEqual([1, 4, 5]);
    expect(ids({ q: 'nada' })).toEqual([]);
  });

  it('los filtros se combinan (Y)', () => {
    expect(ids({ cliente: 10, anio: 2026, vigentesAnteriores: false, soloVigentes: true })).toEqual([1, 5]);
  });
});

describe('portafolio · orden y catálogos', () => {
  it('en ejecución primero, luego próximas, post venta y culminadas; por inicio dentro de cada una', () => {
    const lista = [
      obra({ id_centro_costo: 1, estado_obra: 'CULMINADO' }),
      obra({ id_centro_costo: 2, estado_obra: 'POST_VENTA' }),
      obra({ id_centro_costo: 3, inicio: '2026-10-01' }),
      obra({ id_centro_costo: 4, inicio: '2026-09-01' }),
      obra({ id_centro_costo: 5, efectivo: 'PROXIMO', inicio: '2026-11-02' }),
      obra({ id_centro_costo: 6, estado_obra: 'SUSPENDIDA' }),
    ];
    expect(ordenarObras(lista).map((o) => o.id_centro_costo)).toEqual([4, 3, 5, 6, 2, 1]);
  });

  it('no modifica la lista original', () => {
    const lista = [obra({ id_centro_costo: 2, estado_obra: 'CULMINADO' }), obra({ id_centro_costo: 1 })];
    ordenarObras(lista);
    expect(lista.map((o) => o.id_centro_costo)).toEqual([2, 1]);
  });

  it('catálogos: sin repetidos, ordenados por nombre y años del más reciente al más antiguo', () => {
    const c = catalogosDe([
      obra({ cliente: persona(11, 'Coolbox'), departamento: 'Piura', inicio: '2025-05-05' }),
      obra({ cliente: persona(10, 'Tambo'), departamento: 'Lima' }),
      obra({ cliente: persona(10, 'Tambo'), departamento: 'Lima', equipo: { ...SIN_EQUIPO, jefe_proyecto: persona(102, 'Andrea B.') } }),
      obra({ cliente: null, departamento: null }),
    ]);
    expect(c.clientes.map((x) => x.nombre)).toEqual(['Coolbox', 'Tambo']);
    expect(c.jefes.map((x) => x.nombre)).toEqual(['Andrea B.', 'Carlos G.']);
    expect(c.coordinadores).toHaveLength(1);
    expect(c.departamentos).toEqual(['Lima', 'Piura']);
    expect(c.anios).toEqual([2026, 2025]);
  });
});

describe('portafolio · resumirObra', () => {
  const carga = {
    idCentroCosto: 7,
    estadoObra: 'EN_EJECUCION',
    inicio: '2026-09-23',
    fin: '2026-10-26',
    filas: { cc: { centro_costo: 'OBRA X' }, gen: { tienda: 'Samame Surco', codigo_obra: 'OP-26-020', departamento: 'Lima', comentario: 'ok' } },
  } as unknown as ObraCargada;
  const resultado = {
    real: 79.4,
    partidas: [{ item: '01' }],
    curvaS: { semanas: [{ semana: 1, pactado: 7.4, real: 7.4, desde: 'x' }, { semana: 2, pactado: 22.1, real: null }] },
    avisos: [{ codigo: 'RV-09' }, { codigo: 'RV-10' }],
    situacion: { clave: 'neutral', texto: 'Al día · Sem 5 en curso' },
  } as unknown as ResultadoObra;

  it('une la ficha, el motor y los nombres de pantalla', () => {
    const r = resumirObra(carga, resultado, { cliente: persona(10, 'TAMBO'), equipo: SIN_EQUIPO });
    expect(r).toMatchObject({ id_centro_costo: 7, codigo_obra: 'OP-26-020', nombre: 'TAMBO Samame Surco', tienda: 'Samame Surco', departamento: 'Lima', inicio: '2026-09-23', fin: '2026-10-26', estado_obra: 'EN_EJECUCION' });
  });

  it('no arrastra el árbol, la Curva S ni la lista de avisos: deja el conteo y una mini curva', () => {
    const r = resumirObra(carga, resultado, { cliente: null, equipo: SIN_EQUIPO });
    expect(r.resultado).not.toHaveProperty('partidas');
    expect(r.resultado).not.toHaveProperty('curvaS');
    expect(r.resultado.avisos).toBe(2);
    expect(r.curva).toEqual([{ semana: 1, pactado: 7.4, real: 7.4 }, { semana: 2, pactado: 22.1, real: null }]);
  });

  it('sin cliente usa solo la tienda; sin ninguno, el nombre del centro de costo', () => {
    expect(resumirObra(carga, resultado, { cliente: null, equipo: SIN_EQUIPO }).nombre).toBe('Samame Surco');
    const sinTienda = { ...carga, filas: { cc: { centro_costo: 'OBRA X' }, gen: null } } as unknown as ObraCargada;
    expect(resumirObra(sinTienda, resultado, { cliente: null, equipo: SIN_EQUIPO }).nombre).toBe('OBRA X');
  });

  it('una obra sin partidas no tiene mini curva', () => {
    const r = resumirObra(carga, { ...resultado, curvaS: null } as unknown as ResultadoObra, { cliente: null, equipo: SIN_EQUIPO });
    expect(r.curva).toBeNull();
  });
});
