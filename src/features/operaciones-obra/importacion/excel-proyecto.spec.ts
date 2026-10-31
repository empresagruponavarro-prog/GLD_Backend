import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { aFecha, interpretarProyecto, motivoDe, type Celda, type Hoja } from './excel-proyecto.js';
import { leerLibro } from './leer-libro.js';

const fixture = (nombre: string) => readFileSync(fileURLToPath(new URL(`./__fixtures__/${nombre}`, import.meta.url)));

// ─── Con los Excel reales del jefe (OP-26-017 y OP-26-020) ───────────────────

describe('interpretarProyecto · Excel real OP-26-017', () => {
  let lectura: ReturnType<typeof interpretarProyecto>;
  beforeAll(async () => {
    lectura = interpretarProyecto(await leerLibro(fixture('OP-26-017_Tambo_Pacasmayo_Callao.xlsx')), '2026-10-19');
  });

  it('lee la ficha', () => {
    expect(lectura?.ficha).toMatchObject({
      codigo: 'OP-26-017',
      cliente: 'Tambo',
      tienda: 'Pacasmayo Callao',
      departamento: 'Callao',
      jefe: 'Melissa G.',
      coordinador: 'Abel Narvaez',
      estado: 'EN_EJECUCION',
      inicio: '2026-09-17',
      fin: '2026-10-26',
      fechaActualizacion: '2026-10-19',
    });
  });

  it('sin errores bloqueantes', () => {
    expect(lectura?.errores).toEqual([]);
  });

  it('lee las partidas y subpartidas con sus fechas e ítems', () => {
    const p = lectura!.partidas;
    expect(p.length).toBeGreaterThanOrEqual(5);
    expect(p[0]).toMatchObject({ item: '01', nombre: 'Obras preliminares' });
    expect(p[0].subpartidas[0]).toMatchObject({ item: '01.01', nombre: 'Movilización e instalación de obra', inicio: '2026-09-17', fin: '2026-09-18' });
    const desmontaje = p.flatMap((x) => x.subpartidas).find((s) => s.item === '02.01');
    expect(desmontaje).toMatchObject({ inicio: '2026-09-19', fin: '2026-09-22' });
  });

  it('el avance es lo de cada semana, y las metas automáticas (fórmulas) no se toman como manuales', () => {
    const subs = lectura!.partidas.flatMap((x) => x.subpartidas);
    const desmontaje = subs.find((s) => s.item === '02.01')!;
    expect(desmontaje.avance.slice(0, 3)).toEqual([33.3, 66.7, null]);
    expect(subs.every((s) => s.metas === null)).toBe(true);
    expect(subs.every((s) => s.avance.length === 16)).toBe(true);
  });

  it('cuadra con el golden del Excel: mismas subpartidas, fechas, avance y equipo', () => {
    type Golden = { ficha: { residente: string; respPresupuesto: string; respProcura: string }; partidas: { item: string; subpartidas: { item: string; inicio: string; fin: string; avance: (number | null)[] }[] }[] };
    const golden = JSON.parse(readFileSync(fileURLToPath(new URL('../shared/control-avance/__fixtures__/op-26-017.json', import.meta.url)), 'utf8')) as Golden;
    expect(lectura!.ficha).toMatchObject({ residente: golden.ficha.residente, respPresupuesto: golden.ficha.respPresupuesto, respProcura: golden.ficha.respProcura });
    const leidas = new Map(lectura!.partidas.flatMap((p) => p.subpartidas).map((x) => [x.item, x]));
    const esperadas = golden.partidas.flatMap((p) => p.subpartidas);
    expect(leidas.size).toBe(esperadas.length);
    for (const e of esperadas) {
      const l = leidas.get(e.item);
      expect(l, e.item).toBeDefined();
      expect([l!.inicio, l!.fin]).toEqual([e.inicio, e.fin]);
      expect(l!.avance.slice(0, e.avance.length)).toEqual(e.avance);
    }
  });
});

describe('interpretarProyecto · Excel real OP-26-020', () => {
  it('se lee sin errores y trae partidas', async () => {
    const l = interpretarProyecto(await leerLibro(fixture('OP-26-020_Tambo_Samame_Surco.xlsx')), '2026-10-19');
    expect(l?.errores).toEqual([]);
    expect(l?.ficha.codigo).toBe('OP-26-020');
    expect(l!.partidas.length).toBeGreaterThan(0);
  });
});

// ─── Casos construidos a mano ────────────────────────────────────────────────

const c = (v: Celda['v'], extra: Partial<Celda> = {}): Celda => ({ v, ...extra });
const f = (v: Celda['v']): Celda => ({ v, formula: true });

/** Ficha mínima válida; `sobre` reemplaza el valor de una etiqueta. */
function ficha(sobre: Record<string, Celda | null> = {}): Hoja {
  const base: [string, Celda | null][] = [
    ['Código de obra *', c('OP-26-900')],
    ['Cliente *', c('Tambo')],
    ['Tienda / sede *', c('Lince')],
    ['Departamento *', c('Lima')],
    ['Jefe de proyecto *', c('Ana R.')],
    ['Coordinador *', c('Beto P.')],
    ['Estado *', c('En ejecución')],
    ['Fecha de inicio *', c('2026-09-14', { fecha: true })],
    ['Fecha de fin *', c('2026-10-17', { fecha: true })],
    ['% avance general (0 a 100)', null],
  ];
  return {
    name: 'Ficha',
    rows: [[c('FICHA')], [], [undefined, c('Dato')], ...base.map(([k, v]) => [undefined, c(k), sobre[k] !== undefined ? (sobre[k] ?? undefined) : (v ?? undefined)])],
  };
}

const CAB = ['Ítem', 'Partida', 'Subpartida', 'Tipo', 'Inicio prog.', 'Fin prog.', 'Meta sem 1', 'Meta sem 2', 'Avance sem 1', 'Avance sem 2'];
function partidas(filas: (Celda | undefined)[][]): Hoja {
  return { name: 'Partidas', rows: [[c('PARTIDAS')], [], [], [], CAB.map((x) => c(x)), ...filas] };
}
const sub = (item: string, nombre: string, ini: string | null, fin: string | null, rest: (Celda | undefined)[] = []): (Celda | undefined)[] => [
  c(item),
  undefined,
  c(nombre),
  undefined,
  ini ? c(ini, { fecha: true }) : undefined,
  fin ? c(fin, { fecha: true }) : undefined,
  ...rest,
];

describe('interpretarProyecto · casos', () => {
  const hoy = '2026-10-19';

  it('no es la plantilla por proyecto → null', () => {
    expect(interpretarProyecto([{ name: 'Obras', rows: [] }], hoy)).toBeNull();
    expect(interpretarProyecto([{ name: 'Ficha', rows: [[undefined, c('Código de obra'), c('X')]] }], hoy)).toBeNull();
  });

  it('ficha completa y sin hoja Partidas: solo ficha, con aviso', () => {
    const l = interpretarProyecto([ficha()], hoy)!;
    expect(l.errores).toEqual([]);
    expect(l.partidas).toEqual([]);
    expect(l.avisos.map((a) => a.mensaje).join()).toContain('no tiene la hoja Partidas');
  });

  it('lo que falta en la ficha es un error con su fila', () => {
    const l = interpretarProyecto([ficha({ 'Código de obra *': null, 'Jefe de proyecto *': null, 'Estado *': c('Casi listo') })], hoy)!;
    const msgs = l.errores.map((e) => e.mensaje);
    expect(msgs).toContain('falta el código de obra');
    expect(msgs).toContain('falta el jefe de proyecto');
    expect(msgs).toContain('estado «Casi listo» no válido');
    expect(l.errores.find((e) => e.mensaje.includes('código'))?.fila).toMatch(/^Ficha f\. \d+$/);
  });

  it('fin anterior al inicio', () => {
    const l = interpretarProyecto([ficha({ 'Fecha de fin *': c('2026-09-01', { fecha: true }) })], hoy)!;
    expect(l.errores.map((e) => e.mensaje)).toContain('la fecha de fin es anterior al inicio');
  });

  it('si faltan inicio y fin en la ficha se toman de las subpartidas', () => {
    const l = interpretarProyecto([ficha({ 'Fecha de inicio *': null, 'Fecha de fin *': null }), partidas([[c('01'), c('Preliminares')], sub('01.01', 'Cerco', '2026-09-15', '2026-09-20'), sub('01.02', 'Trazo', '2026-09-21', '2026-10-02')])], hoy)!;
    expect(l.errores).toEqual([]);
    expect(l.ficha).toMatchObject({ inicio: '2026-09-15', fin: '2026-10-02' });
  });

  it('partida con subpartidas: tipo, ítems, avance y metas escritas', () => {
    const l = interpretarProyecto(
      [
        ficha(),
        partidas([
          [c('01'), c('Preliminares')],
          sub('01.01', 'Cerco', '2026-09-14', '2026-09-20', [f(100), c(30), c(60), c(40)]), // meta2 manual, avance sem1 = 60? (ver columnas)
        ]),
      ],
      hoy,
    )!;
    const s = l.partidas[0].subpartidas[0];
    // columnas: 6 = Meta sem 1 (fórmula), 7 = Meta sem 2 (manual), 8 = Avance sem 1, 9 = Avance sem 2
    expect(s.metas).toEqual([null, 30, null, null, null, null, null, null, null, null]);
    expect(s.avance.slice(0, 3)).toEqual([60, 40, null]);
    expect(l.partidas[0]).toMatchObject({ item: '01', nombre: 'Preliminares', tipo: 'CONTRACTUAL' });
  });

  it('error por subpartida: fecha como texto, fin anterior, avance que suma más de 100', () => {
    const l = interpretarProyecto(
      [
        ficha(),
        partidas([
          [c('01'), c('Obra')],
          [c('01.01'), undefined, c('A'), undefined, c('14/09/2026'), c('20/09/2026')], // texto dd/mm/aaaa: válido
          [c('01.02'), undefined, c('B'), undefined, c('texto raro'), c('20/09/2026')],
          sub('01.03', 'C', '2026-09-20', '2026-09-14'),
          sub('01.04', 'D', '2026-09-14', '2026-09-20', [undefined, undefined, c(70), c(60)]),
        ]),
      ],
      hoy,
    )!;
    expect(l.errores.map((e) => e.mensaje)).toEqual([
      'fecha escrita como texto: usa dd/mm/aaaa',
      'el fin es anterior al inicio',
      'el avance suma 130 %: no puede pasar de 100 %',
    ]);
    expect(l.partidas[0].subpartidas.map((s) => s.item)).toEqual(['01.01']);
    expect(l.partidas[0].subpartidas[0]).toMatchObject({ inicio: '2026-09-14', fin: '2026-09-20' });
  });

  it('ítem repetido es error; ítems vacíos se generan', () => {
    const rep = interpretarProyecto([ficha(), partidas([[c('01'), c('Obra')], sub('01.01', 'A', '2026-09-14', '2026-09-15'), sub('01.01', 'B', '2026-09-15', '2026-09-16')])], hoy)!;
    expect(rep.errores.map((e) => e.mensaje)).toContain('ítem 01.01 repetido');
    const gen = interpretarProyecto([ficha(), partidas([[undefined, c('Obra')], sub('', 'A', '2026-09-14', '2026-09-15'), sub('', 'B', '2026-09-15', '2026-09-16')])], hoy)!;
    expect(gen.partidas[0].item).toBe('01');
    expect(gen.partidas[0].subpartidas.map((s) => s.item)).toEqual(['01.01', '01.02']);
  });

  it('el % de avance general solo vale si no hay partidas', () => {
    const solo = interpretarProyecto([ficha({ '% avance general (0 a 100)': c(45) })], hoy)!;
    expect(solo.ficha.avanceGeneral).toBe(45);
    const mal = interpretarProyecto([ficha({ '% avance general (0 a 100)': c(145) })], hoy)!;
    expect(mal.errores.map((e) => e.mensaje)).toContain('el % de avance debe ser un número de 0 a 100');
    const pct = interpretarProyecto([ficha({ '% avance general (0 a 100)': c(0.45, { pct: true }) })], hoy)!;
    expect(pct.ficha.avanceGeneral).toBe(45);
  });

  it('reprogramaciones: válidas, con avisos para las que no se pueden importar', () => {
    const rep: Hoja = {
      name: 'Reprogramaciones',
      rows: [
        [c('REPROGRAMACIONES')],
        [c('N°'), c('Desde'), c('Días'), c('Motivo'), c('Detalle'), c('Aplica a')],
        [c(1), c('2026-09-28', { fecha: true }), c(7), c('Cliente'), c('Cambio de local')],
        [c(2), c('2026-10-05', { fecha: true }), c(90), c('Cliente')],
        [c(3), c('2026-10-06', { fecha: true }), c(3), c('Marte')],
        [c(4), c('2026-10-07', { fecha: true }), c(2), c('Interno'), undefined, c('01')],
        [c(5), c('2026-09-01', { fecha: true }), c(2), c('Cliente')],
        [c(6), c('2026-10-08', { fecha: true }), c(2), c('Permiso / licencia')],
        [c('Resumen')],
      ],
    };
    const l = interpretarProyecto([ficha(), rep], hoy)!;
    expect(l.reprogramaciones.map((r) => [r.desde, r.dias, r.motivo, r.detalle])).toEqual([
      ['2026-09-28', 7, 'CLIENTE', 'Cambio de local'],
      ['2026-10-08', 2, 'PERMISO_LICENCIA', null],
    ]);
    const msgs = l.avisos.map((a) => a.mensaje);
    expect(msgs.some((m) => m.includes('de 1 a 60'))).toBe(true);
    expect(msgs.some((m) => m.includes('«Marte» no reconocido'))).toBe(true);
    expect(msgs.some((m) => m.includes('partida «01»'))).toBe(true);
    expect(msgs.some((m) => m.includes('anterior al inicio'))).toBe(true);
  });

  it('avisos de estado: post venta sin entrega y entrega con la obra en ejecución', () => {
    const pv = interpretarProyecto([ficha({ 'Estado *': c('Post venta') })], hoy)!;
    expect(pv.avisos.map((a) => a.mensaje).join()).toContain('sin fecha de entrega real');
    const con = interpretarProyecto([{ ...ficha(), rows: [...ficha().rows, [undefined, c('Fecha de entrega real'), c('2026-10-10', { fecha: true })]] }], hoy)!;
    expect(con.avisos.map((a) => a.mensaje).join()).toContain('cambia el estado a Post venta');
  });
});

describe('aFecha y motivoDe', () => {
  it('fechas: serial de Excel, dd/mm/aaaa, ISO y basura', () => {
    expect(aFecha(c(46279))).toBe('2026-09-14');
    expect(aFecha(c('14/09/2026'))).toBe('2026-09-14');
    expect(aFecha(c('09/14/2026'), 'mdy')).toBe('2026-09-14');
    expect(aFecha(c('2026-09-14T00:00:00.000Z'))).toBe('2026-09-14');
    expect(aFecha(c('31/02/2026'))).toBeNull();
    expect(aFecha(c('mañana'))).toBeNull();
    expect(aFecha(c(null))).toBeNull();
    expect(aFecha(c('01/01/1980'))).toBeNull();
  });

  it('motivos escritos de varias formas', () => {
    expect(motivoDe('Cliente')).toBe('CLIENTE');
    expect(motivoDe('Permiso / licencia')).toBe('PERMISO_LICENCIA');
    expect(motivoDe('Licencia municipal')).toBe('PERMISO_LICENCIA');
    expect(motivoDe('Proveedor del cliente')).toBe('PROVEEDOR_CLIENTE');
    expect(motivoDe('Fuerza mayor')).toBe('FUERZA_MAYOR');
    expect(motivoDe('Interno (es atraso)')).toBe('INTERNO');
    expect(motivoDe('otra cosa')).toBeNull();
    expect(motivoDe('')).toBeNull();
  });
});
