// Agrupa en una fase "OBRAS CIVILES" las partidas civiles de la plantilla Tambo (hoy dentro de OBRA GRUESA).
// No toca las partidas del catálogo existentes: crea la fase OBRAS CIVILES (misma empresa/CC principal que OBRA GRUESA)
// y sus propias categorías, y re-apunta las partidas de la plantilla indicada.
//
//   node scripts/agrupar-obras-civiles.js [IdPlantilla ...]            → simulación (revierte). Sin argumentos: Olivos R3 y Comas R4
//   node scripts/agrupar-obras-civiles.js [IdPlantilla ...] --aplicar  → aplica en una transacción
import 'dotenv/config';
import pg from 'pg';

const APLICAR = process.argv.includes('--aplicar');
let plantillas = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!plantillas.length) plantillas = ['TPL-TAMBO-OLIVOS-R3', 'TPL-TAMBO-COMAS-R4'];
const ID_OBRA_GRUESA = 'b8713cc6';
const ID_FASE_NUEVA = 'obrasciv';
const PARTIDAS = [
  'CIMIENTO CORRIDO', 'SOBRECIMIENTO', 'ZAPATA', 'MURO DE ALBAÑILERÍA', 'RAMPA', 'COBERTURA',
  'ESTRUCTURA DE CONCRETO', 'ACERO', 'ESTRUCTURA METÁLICA', 'ESCALERA', 'ZONA DE CONDENSADORES',
];
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const q = async (s, p = []) => (await db.query(s, p)).rows;
await db.query('BEGIN');
try {
  const [og] = await q('select * from "ppto_Fases" where "IdpptoFase"=$1', [ID_OBRA_GRUESA]);
  if (!og) throw new Error('No existe la fase OBRA GRUESA del catálogo');
  if (!(await q('select 1 from "ppto_Fases" where "IdpptoFase"=$1', [ID_FASE_NUEVA])).length) {
    await db.query('insert into "ppto_Fases" ("IdpptoFase","FaseProyecto",id_empresa,id_centro_costos_principal) values ($1,$2,$3,$4)',
      [ID_FASE_NUEVA, 'OBRAS CIVILES', og.id_empresa, og.id_centro_costos_principal]);
    console.log('Fase OBRAS CIVILES creada');
  }
  const cats = new Map();
  for (const r of await q('select "IdpptoFaseCategoria" id, "Descripcion" d from "ppto_FasesCategorias" where "IdpptoFase"=$1 order by id', [ID_FASE_NUEVA])) cats.set(norm(r.d), r.id);
  let n = 0;
  for (const nombre of PARTIDAS) {
    if (cats.has(norm(nombre))) continue;
    const id = `OC-${String(++n).padStart(2, '0')}-${Date.now() % 100000}`;
    await db.query('insert into "ppto_FasesCategorias" ("IdpptoFaseCategoria","IdpptoFase","Descripcion") values ($1,$2,$3)', [id, ID_FASE_NUEVA, nombre]);
    cats.set(norm(nombre), id);
  }
  for (const pl of plantillas) {
    const fases = await q('select "IdPlantillaFase" id, "Orden" o, "IdpptoFase" f from "ppto_Plantillas_Fases" where "IdPlantilla"=$1 order by "Orden"', [pl]);
    const grueso = fases.find((f) => f.f === ID_OBRA_GRUESA);
    if (!grueso) throw new Error(`${pl}: no tiene la fase OBRA GRUESA`);
    let nueva = fases.find((f) => f.f === ID_FASE_NUEVA);
    if (!nueva) {
      // OBRAS CIVILES va justo antes de OBRA GRUESA (OBRA GRUESA y las siguientes se corren una posición)
      await db.query('update "ppto_Plantillas_Fases" set "Orden"="Orden"+1 where "IdPlantilla"=$1 and "Orden">=$2', [pl, grueso.o]);
      const id = `TPLF-${pl.replace(/^TPL-/, '')}-OC`;
      await db.query('insert into "ppto_Plantillas_Fases" ("IdPlantillaFase","IdPlantilla","IdpptoFase","Orden") values ($1,$2,$3,$4)', [id, pl, ID_FASE_NUEVA, grueso.o]);
      nueva = { id };
    }
    // partidas de OBRA GRUESA de la plantilla cuyo nombre está en la lista
    const mover = (await q(
      `select c.id, fc."Descripcion" d from "ppto_Plantillas_Categorias" c join "ppto_FasesCategorias" fc on fc."IdpptoFaseCategoria"=c."IdpptoFaseCategoria"
        where c."IdPlantillaFase"=$1 order by c.id`, [grueso.id])).filter((c) => cats.has(norm(c.d)));
    for (const c of mover) {
      await db.query('update "ppto_Plantillas_Categorias" set "IdPlantillaFase"=$1, "IdpptoFaseCategoria"=$2 where id=$3', [nueva.id, cats.get(norm(c.d)), c.id]);
    }
    console.log(`${pl}: ${mover.length} partidas movidas a OBRAS CIVILES`);
  }
  console.table(await q(
    `select f."IdPlantilla" pl, f."Orden" o, pf."FaseProyecto" fase, count(distinct c.id) partidas, count(i.id) items, sum(i."VentaTotal") venta, sum(i."CostoTotal") costo
       from "ppto_Plantillas_Fases" f join "ppto_Fases" pf on pf."IdpptoFase"=f."IdpptoFase"
       left join "ppto_Plantillas_Categorias" c on c."IdPlantillaFase"=f."IdPlantillaFase" left join "ppto_Plantillas_Items" i on i.id_plantilla_categoria=c.id
      where f."IdPlantilla"=any($1) group by 1,2,3 order by 1,2`, [plantillas]));
  await db.query(APLICAR ? 'COMMIT' : 'ROLLBACK');
  console.log(APLICAR ? '\nAPLICADO.' : '\nSIMULACIÓN: se revirtió. Agrega --aplicar.');
} catch (e) {
  await db.query('ROLLBACK').catch(() => {});
  console.error('ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
