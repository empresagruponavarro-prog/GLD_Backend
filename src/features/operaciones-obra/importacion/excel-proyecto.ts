import { MOTIVOS_REPROGRAMACION, SEMANAS_AVANCE, SEMANAS_META, type EstadoObra, type MotivoReprogramacion, type TipoPartida } from '../shared/control-avance/control-avance.types.js';

/**
 * Lector de la plantilla Excel por proyecto (hojas «Ficha», «Partidas» y «Reprogramaciones»). Replica
 * `interpretarProyecto` del Dashboard original (`Dashboard_Operaciones (VF).html` l. 3301-3431) pero
 * es puro: trabaja sobre una grilla ya leída (ver `leer-libro.ts`), sin exceljs ni BD.
 *
 * Los errores bloquean la importación; los avisos solo se muestran.
 */

export interface Celda {
  /** Texto, número o fecha ISO `YYYY-MM-DD` (las fechas de Excel se convierten al leer el libro). */
  v: string | number | null;
  /** La celda es una fórmula: su valor es el calculado, no algo que la persona escribió. */
  formula?: boolean;
  /** La celda tiene formato de porcentaje. */
  pct?: boolean;
  /** La celda es una fecha de Excel (ya viene como `YYYY-MM-DD`). */
  fecha?: boolean;
}

export interface Hoja {
  name: string;
  rows: (Celda | undefined)[][];
}

export interface Mensaje {
  /** `Ficha f. 4`, `Partidas f. 12`… */
  fila: string;
  nombre?: string;
  mensaje: string;
}

export interface SubpartidaExcel {
  fila: number;
  item: string;
  nombre: string;
  tipo: TipoPartida;
  inicio: string;
  fin: string;
  /** Metas escritas a mano (semanas 1-10); `null` en cada semana que usa el reparto automático. */
  metas: (number | null)[] | null;
  /** Avance de cada semana (1-16): lo avanzado solo en esa semana. */
  avance: (number | null)[];
  observacion: string | null;
}

export interface PartidaExcel {
  item: string;
  nombre: string;
  tipo: TipoPartida;
  subpartidas: SubpartidaExcel[];
}

export interface ReprogramacionExcel {
  fila: number;
  desde: string;
  dias: number;
  motivo: MotivoReprogramacion;
  detalle: string | null;
}

export interface FichaExcel {
  codigo: string;
  cliente: string;
  tienda: string;
  departamento: string;
  jefe: string;
  coordinador: string;
  residente: string;
  respPresupuesto: string;
  respProcura: string;
  estadoTexto: string;
  estado: EstadoObra | null;
  inicio: string | null;
  fin: string | null;
  avanceGeneral: number | null;
  comentario: string;
  encargado: string;
  fechaActualizacion: string | null;
  entrega: string | null;
  cierre: string | null;
  plazoPostVenta: number | null;
  observacionesPostVenta: string;
}

export interface LecturaExcel {
  ficha: FichaExcel;
  partidas: PartidaExcel[];
  reprogramaciones: ReprogramacionExcel[];
  errores: Mensaje[];
  avisos: Mensaje[];
}

// ─── Texto y fechas ──────────────────────────────────────────────────────────

/** Minúsculas, sin tildes y con espacios simples. */
export const normT = (s: unknown): string =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Etiqueta de una columna o fila: sin `*` ni paréntesis (`Código de obra *` → `codigo de obra`). */
export const labT = (s: unknown): string => normT(s).replace(/\*/g, '').replace(/\(.*?\)/g, '').trim();

const ESTADOS: Readonly<Record<string, EstadoObra>> = {
  'proximo proyecto': 'PROXIMO',
  proximo: 'PROXIMO',
  'en ejecucion': 'EN_EJECUCION',
  ejecucion: 'EN_EJECUCION',
  'post venta': 'POST_VENTA',
  postventa: 'POST_VENTA',
  'post-venta': 'POST_VENTA',
  culminado: 'CULMINADO',
  culminada: 'CULMINADO',
  suspendida: 'SUSPENDIDA',
  suspendido: 'SUSPENDIDA',
  cancelada: 'CANCELADA',
  cancelado: 'CANCELADA',
};

/** Motivo escrito en el Excel → motivo del ERP (`null` si no se reconoce). */
export function motivoDe(texto: string): MotivoReprogramacion | null {
  const t = normT(texto);
  if (!t) return null;
  const directo = MOTIVOS_REPROGRAMACION.find((m) => normT(m.replace(/_/g, ' ')) === t);
  if (directo) return directo;
  if (t.startsWith('interno')) return 'INTERNO';
  if (t.startsWith('proveedor')) return 'PROVEEDOR_CLIENTE';
  if (t.startsWith('fuerza')) return 'FUERZA_MAYOR';
  if (t.startsWith('permiso') || t.startsWith('licencia')) return 'PERMISO_LICENCIA';
  if (t.startsWith('cliente')) return 'CLIENTE';
  return null;
}

const iso = (y: number, m: number, d: number): string | null => {
  const f = new Date(Date.UTC(y, m - 1, d));
  return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d && y >= 2000 && y <= 2100
    ? `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    : null;
};

/** Orden de las fechas escritas como texto: `mdy` solo si algún valor lo demuestra. */
function ordenFechas(valores: readonly unknown[]): 'dmy' | 'mdy' {
  let dm = false;
  let md = false;
  for (const v of valores) {
    const m = typeof v === 'string' ? /^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}$/.exec(v.trim()) : null;
    if (!m) continue;
    if (+m[1] > 12) dm = true;
    if (+m[2] > 12) md = true;
  }
  return md && !dm ? 'mdy' : 'dmy';
}

/** Fecha de una celda a `YYYY-MM-DD`, o `null` si no es una fecha. Acepta serial de Excel, `dd/mm/aaaa` y ISO. */
export function aFecha(c: Celda | undefined | null, orden: 'dmy' | 'mdy' = 'dmy'): string | null {
  const v = c?.v;
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v <= 0) return null;
    const f = new Date(Math.round(v * 86_400_000) + Date.UTC(1899, 11, 30));
    return iso(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
  }
  const t = v.trim();
  const iso8601 = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (iso8601) return iso(+iso8601[1], +iso8601[2], +iso8601[3]);
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  return orden === 'mdy' ? iso(y, +m[1], +m[2]) : iso(y, +m[2], +m[1]);
}

const texto = (c: Celda | undefined | null): string => (c?.v == null ? '' : String(c.v).trim());

/** `0 a 100` con un decimal. Un `0,5` en una celda con formato % es 50 %. */
function avanceGeneral(c: Celda | undefined | null): { valor: number | null; malo: boolean } {
  if (!c || c.v == null || c.v === '') return { valor: null, malo: false };
  let a: number;
  if (typeof c.v === 'string') {
    const t = c.v.trim();
    const conPct = t.includes('%');
    a = parseFloat(t.replace('%', '').replace(',', '.'));
    if (!conPct && Number.isFinite(a) && c.pct && a <= 1.5) a *= 100;
  } else {
    a = c.v;
    if (c.pct && a <= 1.5) a *= 100;
  }
  if (!Number.isFinite(a) || a < 0 || a > 100) return { valor: null, malo: true };
  return { valor: Math.round(a * 10) / 10, malo: false };
}

// ─── Ficha ───────────────────────────────────────────────────────────────────

const FICHA: Readonly<Record<string, (h: string) => boolean>> = {
  cod: (h) => h.startsWith('codigo'),
  cl: (h) => h.startsWith('cliente'),
  ti: (h) => h.startsWith('tienda') || h.startsWith('sede'),
  dep: (h) => h.startsWith('departamento'),
  je: (h) => h.startsWith('jefe'),
  co: (h) => h.startsWith('coordinador'),
  es: (h) => h.startsWith('estado'),
  ini: (h) => h.startsWith('fecha de inicio'),
  fin: (h) => h.startsWith('fecha de fin'),
  av: (h) => h.startsWith('% avance general') || h.startsWith('avance general'),
  obs: (h) => h.startsWith('comentario'),
  enc: (h) => h.startsWith('encargado'),
  fa: (h) => h.startsWith('fecha de actualizacion'),
  ent: (h) => h.startsWith('fecha de entrega'),
  pvd: (h) => h.startsWith('plazo de post venta'),
  cie: (h) => h.startsWith('fecha de cierre'),
  pvo: (h) => h.startsWith('observaciones de post venta'),
  res: (h) => h.startsWith('residente'),
  rpr: (h) => h.startsWith('resp') && h.includes('presupuesto'),
  rpc: (h) => h.startsWith('resp') && h.includes('procura'),
};

const hoja = (hojas: readonly Hoja[], nombre: string): Hoja | undefined => hojas.find((h) => normT(h.name) === nombre);

/** La etiqueta de cada dato es la primera celda con texto de la fila; el valor, la celda de su derecha. */
function leerFicha(h: Hoja): { v: Record<string, Celda | null>; fila: Record<string, number> } {
  const v: Record<string, Celda | null> = {};
  const fila: Record<string, number> = {};
  h.rows.forEach((row, ri) => {
    if (!row) return;
    const i0 = row.findIndex((c) => c && typeof c.v === 'string' && c.v.trim() !== '');
    const c = row[i0];
    if (i0 < 0 || !c || typeof c.v !== 'string') return;
    const etiqueta = labT(c.v);
    const k = Object.keys(FICHA).find((x) => v[x] === undefined && FICHA[x](etiqueta));
    if (!k) return;
    const valor = row[i0 + 1];
    v[k] = valor && valor.v != null && valor.v !== '' ? valor : null;
    fila[k] = ri + 1;
  });
  return { v, fila };
}

// ─── Lectura principal ───────────────────────────────────────────────────────

type MapaCols = Partial<Record<'it' | 'pa' | 'su' | 'tp' | 'ini' | 'fin' | 'obs', number>> & { metas?: (number | undefined)[]; avance?: (number | undefined)[] };

function cabeceraPartidas(rows: readonly ((Celda | undefined)[] | undefined)[]): { fila: number; cols: MapaCols } | null {
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const hd = (rows[r] ?? []).map((c) => (c && typeof c.v === 'string' ? labT(c.v) : ''));
    const buscar = (f: (h: string) => boolean) => {
      const i = hd.findIndex((x) => x && f(x));
      return i >= 0 ? i : undefined;
    };
    const cols: MapaCols = {
      it: buscar((h) => h === 'item' || h.startsWith('item') || h === 'n°' || h === 'nro' || h.startsWith('codigo')),
      pa: buscar((h) => h === 'partida'),
      su: buscar((h) => h.startsWith('subpartida')),
      tp: buscar((h) => h === 'tipo'),
      ini: buscar((h) => h.startsWith('inicio')),
      fin: buscar((h) => h.startsWith('fin')),
      obs: buscar((h) => h.startsWith('observ') || h.startsWith('comentario')),
    };
    const semanas = (prefijo: RegExp, tope: number) => {
      const out: (number | undefined)[] = [];
      hd.forEach((x, i) => {
        const m = prefijo.exec(x);
        if (m && +m[1] >= 1 && +m[1] <= tope) out[+m[1] - 1] = i;
      });
      return out.length ? out : undefined;
    };
    cols.avance = semanas(/^avance sem\.? ?(\d{1,2})$/, SEMANAS_AVANCE);
    cols.metas = semanas(/^meta sem\.? ?(\d{1,2})$/, SEMANAS_AVANCE);
    if (cols.pa != null && cols.su != null && cols.ini != null && cols.fin != null) return { fila: r, cols };
  }
  return null;
}

/** ¿Es la plantilla por proyecto? (hoja «Ficha» con «Cliente» y «Tienda»). */
export function esPlantillaProyecto(hojas: readonly Hoja[]): boolean {
  const f = hoja(hojas, 'ficha');
  if (!f) return false;
  const { v } = leerFicha(f);
  return v['cl'] !== undefined && v['ti'] !== undefined;
}

/**
 * Interpreta el libro. `hoy` (`YYYY-MM-DD`, Lima) sirve para los avisos que dependen de la fecha.
 * Devuelve `null` si no es la plantilla por proyecto.
 */
export function interpretarProyecto(hojas: readonly Hoja[], hoy: string): LecturaExcel | null {
  const hF = hoja(hojas, 'ficha');
  if (!hF || !esPlantillaProyecto(hojas)) return null;
  const { v, fila } = leerFicha(hF);
  const errores: Mensaje[] = [];
  const avisos: Mensaje[] = [];
  const t = (k: string): string => texto(v[k]);

  // Orden de las fechas escritas como texto (dd/mm o mm/dd), mirando todas las hojas leídas.
  const sospechosas: unknown[] = ['ini', 'fin', 'fa', 'ent', 'cie'].map((k) => v[k]?.v);
  const hP = hoja(hojas, 'partidas');
  const hR = hoja(hojas, 'reprogramaciones');
  const cab = hP ? cabeceraPartidas(hP.rows) : null;
  if (cab) {
    for (let r = cab.fila + 1; r < (hP?.rows.length ?? 0); r++) for (const k of ['ini', 'fin'] as const) sospechosas.push(cab.cols[k] == null ? null : hP?.rows[r]?.[cab.cols[k]]?.v);
  }
  const orden = ordenFechas(sospechosas);
  const fecha = (c: Celda | undefined | null) => aFecha(c, orden);

  // ── Partidas ──
  const partidas: PartidaExcel[] = [];
  if (hP && cab) {
    const { cols } = cab;
    let actual: PartidaExcel | null = null;
    for (let r = cab.fila + 1; r < hP.rows.length; r++) {
      const row = hP.rows[r] ?? [];
      const cel = (k: 'it' | 'pa' | 'su' | 'tp' | 'ini' | 'fin' | 'obs') => (cols[k] == null ? undefined : row[cols[k]]);
      const pa = texto(cel('pa'));
      const su = texto(cel('su'));
      const it = texto(cel('it')).slice(0, 20);
      const cIni = cel('ini');
      const cFin = cel('fin');

      let textoEnAvance = false;
      let fraccion = false;
      let fueraDeRango = false;
      let hayAvance = false;
      const avance: (number | null)[] = Array<number | null>(SEMANAS_AVANCE).fill(null);
      (cols.avance ?? []).forEach((ci, k) => {
        if (ci == null) return;
        const c = row[ci];
        if (!c || c.v == null || c.v === '') return;
        if (typeof c.v !== 'number') {
          if (String(c.v).trim()) textoEnAvance = true;
          return;
        }
        if (c.v < 0 || c.v > 100) {
          fueraDeRango = true;
          return;
        }
        if (c.v > 0 && c.v < 1) fraccion = true;
        avance[k] = Math.round(c.v * 10) / 10;
        hayAvance = true;
      });

      // Metas: solo cuentan las que la persona escribió (las fórmulas son el reparto automático).
      let metas: (number | null)[] | null = null;
      if (cols.metas) {
        const m = Array<number | null>(SEMANAS_META).fill(null);
        cols.metas.forEach((ci, k) => {
          if (ci == null || k >= SEMANAS_META) return;
          const c = row[ci];
          if (!c || c.formula || c.v == null || c.v === '') return;
          const n = typeof c.v === 'number' ? c.v : parseFloat(String(c.v).replace(',', '.'));
          if (Number.isFinite(n)) m[k] = Math.max(0, Math.min(100, Math.round(n * 10) / 10));
        });
        if (m.some((x) => x !== null)) metas = m;
      }

      if (!pa && !su && cIni?.v == null && cFin?.v == null && !hayAvance && !textoEnAvance) continue;
      const tipoTexto = labT(texto(cel('tp')));
      const tipo: TipoPartida = tipoTexto.startsWith('adic') ? 'ADICIONAL' : 'CONTRACTUAL';
      if (pa) {
        actual = { item: it, nombre: pa.slice(0, 150), tipo, subpartidas: [] };
        partidas.push(actual);
      }
      if (!su && cIni?.v == null && cFin?.v == null && !hayAvance) continue; // título de partida
      if (!actual) {
        actual = { item: '', nombre: '(Sin partida)', tipo: 'CONTRACTUAL', subpartidas: [] };
        partidas.push(actual);
      }
      const nombre = (su || pa).slice(0, 150);
      const etiqueta = actual.nombre === nombre ? nombre : `${actual.nombre} › ${nombre}`;
      const donde = `Partidas f. ${r + 1}`;
      const inicio = fecha(cIni);
      const fin = fecha(cFin);
      const textoComoFecha = typeof cIni?.v === 'string' && !inicio ? true : typeof cFin?.v === 'string' && !fin;
      const malo = textoComoFecha
        ? 'fecha escrita como texto: usa dd/mm/aaaa'
        : !inicio
          ? 'falta el inicio programado (o no es una fecha)'
          : !fin
            ? 'falta el fin programado (o no es una fecha)'
            : fin < inicio
              ? 'el fin es anterior al inicio'
              : fueraDeRango
                ? 'el avance de una semana debe estar entre 0 y 100'
                : null;
      if (malo) {
        errores.push({ fila: donde, nombre: etiqueta, mensaje: malo });
        continue;
      }
      const suma = avance.reduce<number>((a, x) => a + (x ?? 0), 0);
      if (suma > 100.5) {
        errores.push({ fila: donde, nombre: etiqueta, mensaje: `el avance suma ${Math.round(suma * 10) / 10} %: no puede pasar de 100 %` });
        continue;
      }
      if (textoEnAvance) avisos.push({ fila: donde, nombre: etiqueta, mensaje: 'avance escrito como texto: no se suma' });
      if (fraccion) avisos.push({ fila: donde, nombre: etiqueta, mensaje: 'avance menor a 1: escribe 50, no 50%' });
      actual.subpartidas.push({
        fila: r + 1,
        item: pa && su ? '' : it,
        nombre,
        tipo: (tipoTexto ? (tipoTexto.startsWith('adic') ? 'ADICIONAL' : 'CONTRACTUAL') : actual.tipo),
        inicio: inicio!,
        fin: fin!,
        metas,
        avance,
        observacion: texto(cel('obs')).slice(0, 200) || null,
      });
    }
  }
  const conSubpartidas = partidas.filter((p) => p.subpartidas.length > 0);

  // ── Ficha ──
  const subs = conSubpartidas.flatMap((p) => p.subpartidas);
  let inicio = fecha(v['ini']);
  let fin = fecha(v['fin']);
  if (conSubpartidas.length) {
    if (!inicio) inicio = subs.reduce((m, s) => (s.inicio < m ? s.inicio : m), subs[0].inicio);
    if (!fin) fin = subs.reduce((m, s) => (s.fin > m ? s.fin : m), subs[0].fin);
  }
  const estadoTexto = t('es');
  const av = avanceGeneral(v['av'] ?? undefined);
  const ficha: FichaExcel = {
    codigo: t('cod').slice(0, 30),
    cliente: t('cl').slice(0, 60),
    tienda: t('ti').slice(0, 80),
    departamento: t('dep').slice(0, 100),
    jefe: t('je').slice(0, 80),
    coordinador: t('co').slice(0, 80),
    residente: t('res').slice(0, 80),
    respPresupuesto: t('rpr').slice(0, 80),
    respProcura: t('rpc').slice(0, 80),
    estadoTexto,
    estado: ESTADOS[normT(estadoTexto)] ?? null,
    inicio,
    fin,
    avanceGeneral: conSubpartidas.length ? null : av.valor,
    comentario: t('obs').slice(0, 200),
    encargado: t('enc').slice(0, 80) || t('je').slice(0, 80),
    fechaActualizacion: fecha(v['fa']),
    entrega: fecha(v['ent']),
    cierre: fecha(v['cie']),
    plazoPostVenta: (() => {
      const n = v['pvd'] ? parseInt(String(v['pvd'].v), 10) : NaN;
      return n >= 1 && n <= 365 ? n : null;
    })(),
    observacionesPostVenta: t('pvo').slice(0, 200),
  };

  const f = (k: string) => `Ficha f. ${fila[k] ?? '?'}`;
  const nombreObra = [ficha.cliente, ficha.tienda].filter(Boolean).join(' ') || '(sin nombre)';
  const falta = (k: string, que: string) => errores.push({ fila: f(k), nombre: nombreObra, mensaje: `falta ${que}` });
  if (!ficha.codigo) falta('cod', 'el código de obra');
  if (!ficha.cliente) falta('cl', 'el cliente');
  if (!ficha.tienda) falta('ti', 'la tienda o sede');
  if (!ficha.departamento) falta('dep', 'el departamento');
  if (!ficha.jefe) falta('je', 'el jefe de proyecto');
  if (!ficha.coordinador) falta('co', 'el coordinador');
  if (!estadoTexto) falta('es', 'el estado');
  else if (!ficha.estado) errores.push({ fila: f('es'), nombre: nombreObra, mensaje: `estado «${estadoTexto}» no válido` });
  if (!ficha.inicio) falta('ini', 'la fecha de inicio');
  if (!ficha.fin) falta('fin', 'la fecha de fin');
  if (ficha.inicio && ficha.fin && ficha.fin < ficha.inicio) errores.push({ fila: f('fin'), nombre: nombreObra, mensaje: 'la fecha de fin es anterior al inicio' });
  if (!conSubpartidas.length && av.malo) errores.push({ fila: f('av'), nombre: nombreObra, mensaje: 'el % de avance debe ser un número de 0 a 100' });
  if (!conSubpartidas.length && !partidas.length && !hP) avisos.push({ fila: 'Partidas', nombre: nombreObra, mensaje: 'el archivo no tiene la hoja Partidas: solo se importa la ficha' });

  // ── Reprogramaciones ──
  const reprogramaciones: ReprogramacionExcel[] = [];
  if (hR) {
    let cabR = -1;
    let m = { nro: -1, d: -1, n: -1, mo: -1, det: -1, ap: -1 };
    for (let r = 0; r < Math.min(hR.rows.length, 15); r++) {
      const hd = (hR.rows[r] ?? []).map((c) => (c && typeof c.v === 'string' ? labT(c.v) : ''));
      const cand = {
        nro: hd.findIndex((x) => x === 'n°' || x === 'nro'),
        d: hd.findIndex((x) => x === 'desde'),
        n: hd.findIndex((x) => x === 'dias'),
        mo: hd.findIndex((x) => x === 'motivo'),
        det: hd.findIndex((x) => x === 'detalle'),
        ap: hd.findIndex((x) => x.startsWith('aplica')),
      };
      if (cand.d >= 0 && cand.n >= 0 && cand.mo >= 0) {
        cabR = r;
        m = cand;
        break;
      }
    }
    if (cabR >= 0) {
      for (let r = cabR + 1; r < Math.min(hR.rows.length, cabR + 31); r++) {
        const row = hR.rows[r] ?? [];
        const g = (i: number) => (i >= 0 ? row[i] : undefined);
        const nro = g(m.nro);
        if (m.nro >= 0 && nro?.v != null && nro.v !== '' && typeof nro.v !== 'number') break; // empieza el resumen
        const cD = g(m.d);
        const cN = g(m.n);
        const motivoTxt = texto(g(m.mo));
        const aplica = texto(g(m.ap)).slice(0, 20);
        if (cD?.v == null && cN?.v == null && !motivoTxt && !aplica) continue;
        const donde = `Reprogramaciones f. ${r + 1}`;
        const desde = fecha(cD);
        const dias = typeof cN?.v === 'number' ? Math.round(cN.v) : parseInt(String(cN?.v ?? ''), 10);
        const motivo = motivoDe(motivoTxt);
        const msg = !desde
          ? 'falta la fecha «Desde» (o no es una fecha)'
          : !(dias >= 1 && dias <= 60)
            ? 'los días deben ser un número de 1 a 60'
            : !motivoTxt
              ? 'falta el motivo'
              : !motivo
                ? `motivo «${motivoTxt}» no reconocido`
                : ficha.inicio && desde < ficha.inicio
                  ? 'la fecha es anterior al inicio de la obra'
                  : aplica
                    ? `es de la partida «${aplica}»: el ERP aún reprograma solo toda la obra`
                    : '';
        if (msg) {
          avisos.push({ fila: donde, nombre: nombreObra, mensaje: `${msg} · no se importa` });
          continue;
        }
        reprogramaciones.push({ fila: r + 1, desde: desde!, dias, motivo: motivo!, detalle: texto(g(m.det)).slice(0, 160) || null });
      }
    }
  }
  reprogramaciones.sort((a, b) => a.desde.localeCompare(b.desde));

  // ── Avisos (no bloquean) ──
  if (ficha.estado === 'POST_VENTA' && !ficha.entrega) avisos.push({ fila: f('ent'), nombre: nombreObra, mensaje: 'sin fecha de entrega real: la post venta se cuenta desde la fecha de fin' });
  if (ficha.entrega && ficha.cierre && ficha.cierre < ficha.entrega) avisos.push({ fila: f('cie'), nombre: nombreObra, mensaje: 'el cierre de post venta es anterior a la entrega: se ignora' });
  if (ficha.entrega && (ficha.estado === 'EN_EJECUCION' || ficha.estado === 'PROXIMO')) avisos.push({ fila: f('ent'), nombre: nombreObra, mensaje: 'tiene fecha de entrega: cambia el estado a Post venta' });
  if (ficha.estado === 'PROXIMO' && ficha.inicio && ficha.inicio <= hoy) avisos.push({ fila: f('es'), nombre: nombreObra, mensaje: 'ya inició: sale «En ejecución» (cambia su estado en la ficha)' });
  if (ficha.fechaActualizacion && ficha.fechaActualizacion > hoy) avisos.push({ fila: f('fa'), nombre: nombreObra, mensaje: `la fecha de actualización (${ficha.fechaActualizacion}) es posterior a hoy` });

  const items = new Map<string, number>();
  for (const p of conSubpartidas) for (const it of [p.item, ...p.subpartidas.map((s) => s.item)]) if (it) items.set(it, (items.get(it) ?? 0) + 1);
  for (const [it, n] of items) if (n > 1) errores.push({ fila: 'Partidas', nombre: nombreObra, mensaje: `ítem ${it} repetido` });

  for (const p of conSubpartidas) {
    for (const s of p.subpartidas) {
      const etiqueta = p.nombre === s.nombre ? s.nombre : `${p.nombre} › ${s.nombre}`;
      const donde = `Partidas f. ${s.fila}`;
      if (s.metas && Math.abs(s.metas.reduce<number>((a, x) => a + (x ?? 0), 0) - 100) > 0.5) {
        // Una meta escrita solo en algunas semanas se completa con el reparto automático: no es un error.
        if (s.metas.every((x) => x !== null)) avisos.push({ fila: donde, nombre: etiqueta, mensaje: 'la meta no suma 100%' });
      }
    }
  }

  // Ítems vacíos: se generan (la plantilla los permite en blanco).
  conSubpartidas.forEach((p, i) => {
    if (!p.item) p.item = String(i + 1).padStart(2, '0');
  });
  for (const p of conSubpartidas) {
    p.subpartidas.forEach((s, j) => {
      if (!s.item) s.item = `${p.item}.${String(j + 1).padStart(2, '0')}`;
    });
  }

  return { ficha, partidas: conSubpartidas, reprogramaciones, errores, avisos };
}
