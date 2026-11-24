// Agrega la subpartida "COMPRA DE ACTIVOS (LUMINARIAS, MOTORES)" (partida 10 del Excel) a la fase OBRA GRUESA de una plantilla Tambo.
// Venta = P.U. del Excel; costo meta = P.U. × % (70 % / 100 %). Cantidad 0 o sin precio quedan en 0.
//
//   node scripts/agregar-compra-activos-tambo.js [IdPlantilla]            → simulación (revierte); sin argumento: TPL-TAMBO-COMAS-R4
//   node scripts/agregar-compra-activos-tambo.js [IdPlantilla] --aplicar
import 'dotenv/config';
import pg from 'pg';

const APLICAR = process.argv.includes('--aplicar');
const PLANTILLA = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'TPL-TAMBO-COMAS-R4';
const FASE_OG = 'b8713cc6';
const ID_FC = 'FC-054646-25'; // "COMPRA DE ACTIVOS (LUMINARIAS, MOTORES)" en el catálogo de OBRA GRUESA
const CATEGORIA_PRODUCTO = 10;

// [item, descripción, cantidad, P.U. venta, % meta]
const ITEMS = [
  ['10.01', 'Suministro de Luminarias tipo panel LED 5000k con 5 años de garantía', 15, 46.99, 0.7],
  ['10.02', 'Suministro de Luminaria lineal hermetica de 28w para adosar sala de ventas de 60cm', 3, 38.1, 1],
  ['10.03', 'Suministro de Luminaria lineal hermetica de 28w para adosar sala de ventas de 1.20m', 7, 60.77, 1],
  ['10.04', 'Suministro de Luminaria lineal hermetica de 28w para adosar almacén', 0, 60.77, 0.7],
  ['10.05', 'Suministro de luminarias tipo campana', 1, 121, 0.7],
  ['10.06', 'Suministro de Luminarias tipo campana para doble altura', 0, 0, 0.7],
  ['10.07', 'Suministro de equipo de extracción para tienda  motor extractor TD1000 Soler & Palau', 3, 1445.6, 0.7],
  ['10.08', 'Suministro de equipo de extracción para tienda  motor inyeccion TD1000 Soler & Palau', 1, 1445.6, 0.7],
  ['10.09', 'Instalación de reflectores pastorales en fachada', 10, 20, 0.7],
  ['10.10', 'Instalacion de luces de emergencia', 7, 20, 0.7],
  ['10.11', 'Suministro de Luminarias para fachada (spot, empotrada o adosada)', 10, 21, 1],
  ['10.12', 'Tapa metalica 60x60 para Cisterna (incluye marco)', 1, 357.14, 0.7],
];

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const r2 = (n) => Math.round(n * 100) / 100;

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
await db.query('BEGIN');
try {
  const [faseOg] = await q('select "IdPlantillaFase" id from "ppto_Plantillas_Fases" where "IdPlantilla"=$1 and "IdpptoFase"=$2', [PLANTILLA, FASE_OG]);
  if (!faseOg) throw new Error(`${PLANTILLA}: no tiene la fase OBRA GRUESA`);
  if ((await q('select 1 from "ppto_Plantillas_Categorias" where "IdPlantillaFase"=$1 and "IdpptoFaseCategoria"=$2', [faseOg.id, ID_FC])).length) throw new Error('La subpartida ya está en la plantilla');
  if (!(await q('select 1 from "ppto_FasesCategorias" where "IdpptoFaseCategoria"=$1', [ID_FC])).length) throw new Error(`No existe ${ID_FC} en el catálogo`);
  const [{ id: idUm }] = await q(`select id from unidad_medida where simbolo='und'`);
  const productos = new Map();
  for (const r of await q(`select id, descripcion from producto order by (codigo like 'SRV-TMB-%') desc, id`)) if (!productos.has(norm(r.descripcion))) productos.set(norm(r.descripcion), r.id);
  let sig = Number((await q(`select max(substring(codigo from 9)::int) m from producto where codigo ~ '^SRV-TMB-[0-9]+$'`))[0].m ?? 1000);

  const [{ id: idPart }] = await q('insert into "ppto_Plantillas_Categorias" ("IdPlantillaFase","IdpptoFaseCategoria",id_categoria) values ($1,$2,$3) returning id', [faseOg.id, ID_FC, CATEGORIA_PRODUCTO]);
  let nuevos = 0, venta = 0, costo = 0;
  for (const [orden, [item, desc, cant, pu, pct]] of ITEMS.entries()) {
    let idProd = productos.get(norm(desc));
    if (!idProd) {
      [{ id: idProd }] = await q(
        `insert into producto (codigo, descripcion, id_categoria, id_unidad_medida, tipo_producto, clase_inventario) values ($1,$2,$3,$4,'SERVICIO','CONSUMIBLE') returning id`,
        [`SRV-TMB-${++sig}`, desc.toUpperCase(), CATEGORIA_PRODUCTO, idUm],
      );
      productos.set(norm(desc), idProd);
      nuevos++;
    }
    const meta = r2(pu * pct);
    const v = r2(cant * pu);
    const c = r2(cant * meta);
    await db.query(
      'insert into "ppto_Plantillas_Items" (id_plantilla_categoria,id_producto,id_unidad_medida,"Item","Cantidad","CostoUnitario","PrecioVenta","CostoTotal","VentaTotal","Orden") values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [idPart, idProd, idUm, item, cant, meta, pu, c, v, orden],
    );
    venta += v; costo += c;
  }
  console.log({ plantilla: PLANTILLA, items: ITEMS.length, productosNuevos: nuevos, venta: venta.toFixed(2), costoMeta: costo.toFixed(2) });
  console.table(await q(`select sum(i."VentaTotal") venta, sum(i."CostoTotal") costo from "ppto_Plantillas_Fases" f join "ppto_Plantillas_Categorias" c on c."IdPlantillaFase"=f."IdPlantillaFase" join "ppto_Plantillas_Items" i on i.id_plantilla_categoria=c.id where f."IdPlantilla"=$1`, [PLANTILLA]));
  await db.query(APLICAR ? 'COMMIT' : 'ROLLBACK');
  console.log(APLICAR ? 'APLICADO.' : 'SIMULACIÓN: se revirtió. Agrega --aplicar.');
} catch (e) { await db.query('ROLLBACK').catch(() => {}); console.error('ERROR:', e.message); process.exitCode = 1; } finally { await db.end(); }
