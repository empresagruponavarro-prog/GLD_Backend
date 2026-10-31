import ExcelJS from 'exceljs';
import type { Celda, Hoja } from './excel-proyecto.js';

const MAX_FILAS = 600;
const MAX_COLUMNAS = 140;

const isoUtc = (d: Date): string => d.toISOString().slice(0, 10);

/** Valor simple de una celda de exceljs (texto, número o fecha ISO); `null` si está vacía o es un error. */
function valorSimple(v: ExcelJS.CellValue): { v: Celda['v']; fecha?: boolean } {
  if (v == null) return { v: null };
  if (v instanceof Date) return { v: Number.isNaN(v.getTime()) ? null : isoUtc(v), fecha: true };
  if (typeof v === 'number' || typeof v === 'string') return { v };
  if (typeof v === 'boolean') return { v: v ? 'VERDADERO' : 'FALSO' };
  if (typeof v === 'object') {
    if ('richText' in v) return { v: v.richText.map((t) => t.text).join('') };
    if ('text' in v && typeof v.text === 'string') return { v: v.text }; // hipervínculo
    if ('error' in v) return { v: null };
  }
  return { v: null };
}

/** Convierte una celda de exceljs a la grilla neutra que lee `interpretarProyecto`. */
function aCelda(cell: ExcelJS.Cell): Celda | undefined {
  const raw = cell.value;
  if (raw == null) return undefined;
  const pct = typeof cell.numFmt === 'string' && cell.numFmt.includes('%');
  if (typeof raw === 'object' && !(raw instanceof Date) && ('formula' in raw || 'sharedFormula' in raw)) {
    const resultado = 'result' in raw ? raw.result : undefined;
    const { v, fecha } = valorSimple(resultado as ExcelJS.CellValue);
    return { v, formula: true, pct, fecha };
  }
  const { v, fecha } = valorSimple(raw);
  return v == null ? undefined : { v, pct, fecha };
}

/** Lee un `.xlsx` y devuelve sus hojas como grilla (las fechas ya vienen en `YYYY-MM-DD`). */
export async function leerLibro(buffer: Buffer): Promise<Hoja[]> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return libro.worksheets.map((ws) => {
    const rows: (Celda | undefined)[][] = [];
    const filas = Math.min(ws.rowCount, MAX_FILAS);
    for (let r = 1; r <= filas; r++) {
      const row = ws.getRow(r);
      const fila: (Celda | undefined)[] = [];
      const columnas = Math.min(row.cellCount, MAX_COLUMNAS);
      for (let c = 1; c <= columnas; c++) fila[c - 1] = aCelda(row.getCell(c));
      rows[r - 1] = fila;
    }
    return { name: ws.name, rows };
  });
}
