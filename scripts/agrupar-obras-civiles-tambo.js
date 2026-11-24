// Mueve las partidas de la fase "OBRAS CIVILES" (IdpptoFase 'obrasciv') de una plantilla Tambo DENTRO de la fase OBRA GRUESA
// como UNA sola subpartida "OBRAS CIVILES" (queda justo después de la primera subpartida de Obra gruesa, que es la de OBRAS PRELIMINARES).
// Los ítems conservan su orden. Se elimina la fase 'obrasciv' de la plantilla (el catálogo de fases/subpartidas no se toca).
//
//   node scripts/agrupar-obras-civiles-tambo.js [IdPlantilla ...]            → simulación (revierte); sin argumentos: Olivos R3 y Comas R4
//   node scripts/agrupar-obras-civiles-tambo.js [IdPlantilla ...] --aplicar  → aplica en una transacción
//
// Orden en el servidor: cargar-plantilla-tambo-olivos.js → cargar-meta-tambo-olivos.js → este script.
import 'dotenv/config';
import pg from 'pg';

const APLICAR = process.argv.includes('--aplicar');
const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const PLANTILLAS = ids.length ? ids : ['TPL-TAMBO-OLIVOS-R3', 'TPL-TAMBO-COMAS-R4'];
const FASE_OG = 'b8713cc6';
const FASE_OC = 'obrasciv';
// Si la plantilla aún tiene esas partidas dentro de OBRA GRUESA (recién cargada), se toman de ahí.
const PARTIDAS = [
  'CIMIENTO CORRIDO', 'SOBRECIMIENTO', 'ZAPATA', 'MURO DE ALBAÑILERÍA', 'RAMPA', 'COBERTURA',
  'ESTRUCTURA DE CONCRETO', 'ACERO', 'ESTRUCTURA METÁLICA', 'ESCALERA', 'ZONA DE CONDENSADORES',
];
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
await db.query('BEGIN');
try {
  // Subpartida de catálogo "OBRAS CIVILES" en OBRA GRUESA (se reutiliza si ya existe)
  let [fc] = await q(`select "IdpptoFaseCategoria" id from "ppto_FasesCategorias" where "IdpptoFase"=$1 and upper("Descripcion")='OBRAS CIVILES' order by 1 limit 1`, [FASE_OG]);
  if (!fc) {
    const id = `FC-OC-${String(Date.now() % 1000000).padStart(6, '0')}`;
    await db.query('insert into "ppto_FasesCategorias" ("IdpptoFaseCategoria","IdpptoFase","Descripcion") values ($1,$2,$3)', [id, FASE_OG, 'OBRAS CIVILES']);
    fc = { id };
    console.log('Subpartida de catálogo creada:', id);
  }
  for (const pl of PLANTILLAS) {
    const [faseOc] = await q('select "IdPlantillaFase" id from "ppto_Plantillas_Fases" where "IdPlantilla"=$1 and "IdpptoFase"=$2', [pl, FASE_OC]);
    const [faseOg] = await q('select "IdPlantillaFase" id from "ppto_Plantillas_Fases" where "IdPlantilla"=$1 and "IdpptoFase"=$2', [pl, FASE_OG]);
    if (!faseOg) throw new Error(`${pl}: no tiene la fase OBRA GRUESA`);
    let destino; // fila de plantilla que queda como subpartida OBRAS CIVILES
    let resto; // filas cuyos ítems se pasan a destino y que se eliminan
    if (faseOc) {
      const parts = await q('select id from "ppto_Plantillas_Categorias" where "IdPlantillaFase"=$1 order by id', [faseOc.id]);
      if (!parts.length) { console.log(`${pl}: la fase OBRAS CIVILES no tiene partidas (nada que hacer)`); continue; }
      destino = parts[0];
      resto = parts.slice(1);
      await db.query('update "ppto_Plantillas_Categorias" set "IdPlantillaFase"=$1, "IdpptoFaseCategoria"=$2 where id=$3', [faseOg.id, fc.id, destino.id]);
    } else {
      const todas = await q(
        `select c.id, fc."Descripcion" d from "ppto_Plantillas_Categorias" c join "ppto_FasesCategorias" fc on fc."IdpptoFaseCategoria"=c."IdpptoFaseCategoria" where c."IdPlantillaFase"=$1 order by c.id`,
        [faseOg.id],
      );
      const oc = todas.find((c) => norm(c.d) === 'OBRAS CIVILES');
      const sueltas = todas.filter((c) => PARTIDAS.map(norm).includes(norm(c.d)) && c.id !== oc?.id);
      if (!sueltas.length) { console.log(`${pl}: no hay partidas de obras civiles sueltas (nada que hacer)`); continue; }
      if (oc) {
        destino = oc;
        resto = sueltas;
      } else {
        destino = sueltas[0];
        resto = sueltas.slice(1);
        // La subpartida OBRAS CIVILES reutiliza la fila de la primera (su id queda entre OBRAS PRELIMINARES y las demás).
        await db.query('update "ppto_Plantillas_Categorias" set "IdpptoFaseCategoria"=$1 where id=$2', [fc.id, destino.id]);
      }
    }
    const idsResto = resto.map((r) => r.id);
    if (idsResto.length) {
      await db.query('update "ppto_Plantillas_Items" set id_plantilla_categoria=$1 where id_plantilla_categoria = any($2::int[])', [destino.id, idsResto]);
      await db.query('delete from "ppto_Plantillas_Categorias" where id = any($1::int[])', [idsResto]);
    }
    if (faseOc) await db.query('delete from "ppto_Plantillas_Fases" where "IdPlantillaFase"=$1', [faseOc.id]);
    const [{ n, venta, costo }] = await q('select count(*) n, sum("VentaTotal") venta, sum("CostoTotal") costo from "ppto_Plantillas_Items" where id_plantilla_categoria=$1', [destino.id]);
    console.log(`${pl}: ${resto.length + 1} partidas → 1 subpartida OBRAS CIVILES con ${n} ítems (venta ${venta}, costo meta ${costo})`);
  }
  console.table(await q(
    `select f."IdPlantilla" plantilla, f."Orden" fase, fc."Descripcion" subpartida, count(i.id) items, sum(i."VentaTotal") venta from "ppto_Plantillas_Fases" f join "ppto_Plantillas_Categorias" c on c."IdPlantillaFase"=f."IdPlantillaFase" join "ppto_FasesCategorias" fc on fc."IdpptoFaseCategoria"=c."IdpptoFaseCategoria" left join "ppto_Plantillas_Items" i on i.id_plantilla_categoria=c.id where f."IdPlantilla" = any($1) and f."IdpptoFase"=$2 group by 1,2,3,c.id order by 1, c.id`,
    [PLANTILLAS, FASE_OG],
  ));
  console.table(await q(`select f."IdPlantilla" plantilla, sum(i."VentaTotal") venta, sum(i."CostoTotal") costo from "ppto_Plantillas_Fases" f join "ppto_Plantillas_Categorias" c on c."IdPlantillaFase"=f."IdPlantillaFase" join "ppto_Plantillas_Items" i on i.id_plantilla_categoria=c.id where f."IdPlantilla" = any($1) group by 1`, [PLANTILLAS]));
  await db.query(APLICAR ? 'COMMIT' : 'ROLLBACK');
  console.log(APLICAR ? '\nAPLICADO.' : '\nSIMULACIÓN: se revirtió. Agrega --aplicar.');
} catch (e) {
  await db.query('ROLLBACK').catch(() => {});
  console.error('ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
