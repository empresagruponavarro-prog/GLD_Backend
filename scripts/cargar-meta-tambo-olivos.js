// Completa el costo META (CostoUnitario / CostoTotal) de la plantilla TPL-TAMBO-OLIVOS-R3 desde
// scripts/tambo-olivos-meta.datos.json (generado de "META TAMBO MARAÑON 2 LOS OLIVOS V2.xlsx", columna P.U. PROVEEDOR sin IGV).
// Si un ítem tiene suministro e instalación en hojas distintas del META, el costo unitario es la suma.
// La cantidad es la de la plantilla (no se toca); CostoTotal = cantidad × costo unitario a 2 decimales.
//
//   node scripts/cargar-meta-tambo-olivos.js [meta.json] [IdPlantilla]            → simulación (revierte); sin argumentos: Los Olivos REV 3. Comas REV 4: tambo-comas-meta.datos.json TPL-TAMBO-COMAS-R4
//   node scripts/cargar-meta-tambo-olivos.js --aplicar  → aplica en una transacción
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const APLICAR = process.argv.includes('--aplicar');
const aqui = path.dirname(fileURLToPath(import.meta.url));
const [archivo = 'tambo-olivos-meta.datos.json', PLANTILLA = 'TPL-TAMBO-OLIVOS-R3'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const metas = JSON.parse(fs.readFileSync(path.resolve(aqui, archivo), 'utf-8'));
const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
await db.query('BEGIN');
try {
  const { rows } = await db.query(
    `select i.id, f."Orden" fase, i."Item" item, p.descripcion, i."Cantidad" cantidad
       from "ppto_Plantillas_Items" i
       join "ppto_Plantillas_Categorias" c on c.id = i.id_plantilla_categoria
       join "ppto_Plantillas_Fases" f on f."IdPlantillaFase" = c."IdPlantillaFase"
       join producto p on p.id = i.id_producto
      where f."IdPlantilla" = $1`,
    [PLANTILLA],
  );
  if (!rows.length) throw new Error(`No existe la plantilla ${PLANTILLA}`);
  const porClave = new Map(rows.map((r) => [`${r.fase}|${r.item}|${norm(r.descripcion)}`, r]));
  let hechos = 0;
  let total = 0;
  const faltan = [];
  for (const m of metas) {
    const r = porClave.get(`${m.fase}|${m.item}|${m.desc}`);
    if (!r) { faltan.push(`${m.item} ${m.desc.slice(0, 60)}`); continue; }
    const costo = Math.round(m.costo * 100) / 100;
    const costoTotal = Math.round(Number(r.cantidad) * costo * 100) / 100;
    await db.query('update "ppto_Plantillas_Items" set "CostoUnitario"=$1, "CostoTotal"=$2 where id=$3', [costo, costoTotal, r.id]);
    hechos++;
    total += costoTotal;
  }
  console.log({ itemsPlantilla: rows.length, actualizados: hechos, sinEncontrar: faltan.length, costoMetaTotal: total.toFixed(2) });
  if (faltan.length) console.log('No encontrados:\n  ' + faltan.join('\n  '));
  console.table((await db.query(
    `select f."Orden", sum(i."CostoTotal") costo, sum(i."VentaTotal") venta from "ppto_Plantillas_Fases" f join "ppto_Plantillas_Categorias" c on c."IdPlantillaFase"=f."IdPlantillaFase" join "ppto_Plantillas_Items" i on i.id_plantilla_categoria=c.id where f."IdPlantilla"=$1 group by 1 order by 1`, [PLANTILLA])).rows);
  await db.query(APLICAR ? 'COMMIT' : 'ROLLBACK');
  console.log(APLICAR ? '\nAPLICADO.' : '\nSIMULACIÓN: se revirtió. Agrega --aplicar.');
} catch (e) {
  await db.query('ROLLBACK').catch(() => {});
  console.error('ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
