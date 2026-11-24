// Crea la plantilla "TAMBO – IMPLEMENTACIÓN Y OBRA GRUESA REV 3 (LOS OLIVOS)" a partir de scripts/tambo-olivos-rev3.datos.json
// (generado del Excel "ITEMIZADO TAMBO MARAÑON 2 - LOS OLIVOS REV 3.xlsx"). NO toca las plantillas existentes.
//
//   node scripts/cargar-plantilla-tambo-olivos.js            → simulación: ejecuta todo y revierte (no deja nada)
//   node scripts/cargar-plantilla-tambo-olivos.js --aplicar  → carga en UNA transacción
//
// - Partidas: si el nombre ya existe como categoría de fase (ppto_FasesCategorias de esa fase) la reutiliza; si no, la crea.
// - Ítems: busca el producto por descripción (sin tildes/mayúsculas); si no existe crea un SERVICIO SRV-TMB-nnnn.
// - PRECIO UNIT del Excel = precio de venta; el costo meta queda en 0.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const APLICAR = process.argv.includes('--aplicar');
const aqui = path.dirname(fileURLToPath(import.meta.url));
const datos = JSON.parse(fs.readFileSync(path.join(aqui, 'tambo-olivos-rev3.datos.json'), 'utf-8'));

const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
const UM = { UND: 'und', UNID: 'und', UNI: 'und', 'UN.': 'und', 'UNID.': 'und', GLB: 'glb', ML: 'ml', M2: 'm2', M3: 'm3', MES: 'mes', PTO: 'pto', KG: 'KG' };
const CATEGORIA_POR_SECCION = { 'DEMOLICIONES Y DESMONTAJES': 10, 'MURO DE DRYWALL /SUPERBOARD': 4 };
const CATEGORIA_DEFECTO = 10;

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
await db.query('BEGIN');
try {
  const p = datos.plantilla;
  if ((await q('select 1 from "ppto_Plantillas" where "IdPlantilla"=$1', [p.id])).length) throw new Error(`La plantilla ${p.id} ya existe`);

  const unidades = new Map((await q('select id, simbolo from unidad_medida')).map((u) => [norm(u.simbolo), u.id]));
  const productos = new Map();
  for (const r of await q(`select id, codigo, descripcion from producto order by (codigo like 'SRV-TMB-%') desc, id`)) {
    const k = norm(r.descripcion);
    if (!productos.has(k)) productos.set(k, r.id);
  }
  let siguiente = Number((await q(`select max(substring(codigo from 9)::int) m from producto where codigo ~ '^SRV-TMB-[0-9]+$'`))[0].m ?? 1000);
  const stats = { partidasNuevas: 0, partidasReusadas: 0, prodNuevos: 0, prodReusados: 0, items: 0, venta: 0 };
  const nuevosProductos = [];

  await db.query(
    'insert into "ppto_Plantillas" ("IdPlantilla","Nombre","Descripcion","Activo","FechaCreacion") values ($1,$2,$3,true,now())',
    [p.id, p.nombre, p.descripcion],
  );
  let contFc = 0;
  for (const [orden, fase] of datos.fases.entries()) {
    const idFase = `TPLF-${p.id}-${String(orden + 1).padStart(2, '0')}`;
    await db.query('insert into "ppto_Plantillas_Fases" ("IdPlantillaFase","IdPlantilla","IdpptoFase","Orden") values ($1,$2,$3,$4)', [idFase, p.id, fase.IdpptoFase, orden]);
    const existentes = new Map();
    for (const r of await q('select "IdpptoFaseCategoria" id, "Descripcion" d from "ppto_FasesCategorias" where "IdpptoFase"=$1 order by id', [fase.IdpptoFase])) {
      if (!existentes.has(norm(r.d))) existentes.set(norm(r.d), r.id);
    }
    // id_categoria de las partidas ya usadas en plantillas de esa fase, para reutilizarlo
    const catDe = new Map();
    for (const r of await q('select c."IdpptoFaseCategoria" id, c.id_categoria from "ppto_Plantillas_Categorias" c join "ppto_Plantillas_Fases" f on f."IdPlantillaFase"=c."IdPlantillaFase" where f."IdpptoFase"=$1 and c.id_categoria is not null order by c.id', [fase.IdpptoFase])) {
      if (!catDe.has(r.id)) catDe.set(r.id, r.id_categoria);
    }
    let ordenItem = 0;
    for (const sec of fase.secciones) {
      let idFc = existentes.get(norm(sec.nombre));
      if (idFc) stats.partidasReusadas++;
      else {
        idFc = `FC-${String(Date.now() % 1000000).padStart(6, '0')}-${++contFc}`;
        await db.query('insert into "ppto_FasesCategorias" ("IdpptoFaseCategoria","IdpptoFase","Descripcion") values ($1,$2,$3)', [idFc, fase.IdpptoFase, sec.nombre.toUpperCase()]);
        existentes.set(norm(sec.nombre), idFc);
        stats.partidasNuevas++;
      }
      const idCategoria = catDe.get(idFc) ?? CATEGORIA_POR_SECCION[norm(sec.nombre)] ?? CATEGORIA_DEFECTO;
      const [{ id: idPart }] = await q(
        'insert into "ppto_Plantillas_Categorias" ("IdPlantillaFase","IdpptoFaseCategoria",id_categoria) values ($1,$2,$3) returning id',
        [idFase, idFc, idCategoria],
      );
      for (const it of sec.items) {
        const idUm = unidades.get(norm(UM[norm(it.um)] ?? it.um));
        if (!idUm) throw new Error(`Unidad sin equivalencia "${it.um}" (fila ${it.fila}, ${fase.hoja})`);
        const clave = norm(it.descripcion);
        let idProd = productos.get(clave);
        if (idProd) stats.prodReusados++;
        else {
          const codigo = `SRV-TMB-${++siguiente}`;
          [{ id: idProd }] = await q(
            `insert into producto (codigo, descripcion, id_categoria, id_unidad_medida, tipo_producto, clase_inventario) values ($1,$2,$3,$4,'SERVICIO','CONSUMIBLE') returning id`,
            [codigo, it.descripcion.toUpperCase(), idCategoria, idUm],
          );
          productos.set(clave, idProd);
          nuevosProductos.push(`${codigo} ${it.descripcion}`);
          stats.prodNuevos++;
        }
        const venta = Math.round(it.cantidad * it.precio * 100) / 100;
        await db.query(
          'insert into "ppto_Plantillas_Items" (id_plantilla_categoria,id_producto,id_unidad_medida,"Item","Cantidad","CostoUnitario","PrecioVenta","CostoTotal","VentaTotal","Orden") values ($1,$2,$3,$4,$5,0,$6,0,$7,$8)',
          [idPart, idProd, idUm, it.item, it.cantidad, it.precio, venta, ordenItem++],
        );
        stats.items++;
        stats.venta += venta;
      }
    }
  }
  console.log(stats, '\nVenta total ítems:', stats.venta.toFixed(2));
  if (nuevosProductos.length) console.log('Productos nuevos (muestra):\n  ' + nuevosProductos.slice(0, 15).join('\n  '));
  const resumen = await q(
    'select f."Orden", count(distinct c.id) partidas, count(i.id) items, sum(i."VentaTotal") venta from "ppto_Plantillas_Fases" f left join "ppto_Plantillas_Categorias" c on c."IdPlantillaFase"=f."IdPlantillaFase" left join "ppto_Plantillas_Items" i on i.id_plantilla_categoria=c.id where f."IdPlantilla"=$1 group by 1 order by 1',
    [p.id],
  );
  console.table(resumen);
  if (APLICAR) {
    await db.query('COMMIT');
    console.log('\nAPLICADO.');
  } else {
    await db.query('ROLLBACK');
    console.log('\nSIMULACIÓN: se revirtió todo. Agrega --aplicar para cargar.');
  }
} catch (e) {
  await db.query('ROLLBACK').catch(() => {});
  console.error('ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
