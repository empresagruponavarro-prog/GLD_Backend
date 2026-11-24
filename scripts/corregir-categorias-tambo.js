// Corrige la categoría de los productos SRV-TMB-* que el cargador dejó en "1. CD - CIVIL" (categoría por defecto),
// con la categoría que trae el META (scripts/tambo-categorias.datos.json: descripción del producto → código de categoría).
// Solo toca productos SRV-TMB-* y solo si la categoría actual es distinta.
//
//   node scripts/corregir-categorias-tambo.js            → simulación (revierte)
//   node scripts/corregir-categorias-tambo.js --aplicar
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const APLICAR = process.argv.includes('--aplicar');
const aqui = path.dirname(fileURLToPath(import.meta.url));
const datos = JSON.parse(fs.readFileSync(path.join(aqui, 'tambo-categorias.datos.json'), 'utf-8'));
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
await db.query('BEGIN');
try {
  const cats = new Map((await db.query('select id, codigo from categoria')).rows.map((c) => [c.codigo, c.id]));
  const prods = new Map();
  for (const p of (await db.query(`select id, codigo, descripcion, id_categoria from producto where codigo like 'SRV-TMB-%'`)).rows) prods.set(norm(p.descripcion), p);
  let cambiados = 0, iguales = 0;
  const faltan = [];
  const resumen = {};
  for (const d of datos) {
    const idCat = cats.get(d.categoria);
    if (!idCat) throw new Error(`Categoría ${d.categoria} no existe`);
    const p = prods.get(norm(d.descripcion));
    if (!p) { faltan.push(d.descripcion.slice(0, 60)); continue; }
    if (p.id_categoria === idCat) { iguales++; continue; }
    await db.query('update producto set id_categoria=$1 where id=$2', [idCat, p.id]);
    cambiados++;
    resumen[d.categoria] = (resumen[d.categoria] ?? 0) + 1;
  }
  console.log({ enArchivo: datos.length, cambiados, yaCorrectos: iguales, sinProducto: faltan.length });
  console.log(resumen);
  if (faltan.length) console.log('Sin producto en esta base:\n  ' + faltan.join('\n  '));
  await db.query(APLICAR ? 'COMMIT' : 'ROLLBACK');
  console.log(APLICAR ? 'APLICADO.' : 'SIMULACIÓN: se revirtió. Agrega --aplicar.');
} catch (e) { await db.query('ROLLBACK').catch(() => {}); console.error('ERROR:', e.message); process.exitCode = 1; } finally { await db.end(); }
