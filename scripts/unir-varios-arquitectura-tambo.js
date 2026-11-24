// Une la subpartida "ACCESORIOS VARIOS" dentro de "VARIOS DE ARQUITECTURA" en las plantillas Tambo (Implementación).
//   node scripts/unir-varios-arquitectura-tambo.js [IdPlantilla ...]            → simulación; sin argumentos: Olivos R3 y Comas R4
//   node scripts/unir-varios-arquitectura-tambo.js [IdPlantilla ...] --aplicar
import 'dotenv/config';
import pg from 'pg';
const APLICAR = process.argv.includes('--aplicar');
const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const PLANTILLAS = ids.length ? ids : ['TPL-TAMBO-OLIVOS-R3', 'TPL-TAMBO-COMAS-R4'];
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const q = async (s, p = []) => (await db.query(s, p)).rows;
await db.query('BEGIN');
try {
  for (const pl of PLANTILLAS) {
    const fila = (d) => q(`select c.id from "ppto_Plantillas_Categorias" c join "ppto_Plantillas_Fases" f on f."IdPlantillaFase"=c."IdPlantillaFase" join "ppto_FasesCategorias" fc on fc."IdpptoFaseCategoria"=c."IdpptoFaseCategoria" where f."IdPlantilla"=$1 and upper(fc."Descripcion")=$2 order by c.id`, [pl, d]);
    const [destino] = await fila('VARIOS DE ARQUITECTURA');
    const [origen] = await fila('ACCESORIOS VARIOS');
    if (!destino || !origen) { console.log(`${pl}: nada que unir`); continue; }
    const r = await db.query('update "ppto_Plantillas_Items" set id_plantilla_categoria=$1 where id_plantilla_categoria=$2', [destino.id, origen.id]);
    await db.query('delete from "ppto_Plantillas_Categorias" where id=$1', [origen.id]);
    const [t] = await q('select count(*) n, sum("VentaTotal") venta from "ppto_Plantillas_Items" where id_plantilla_categoria=$1', [destino.id]);
    console.log(`${pl}: ${r.rowCount} ítems movidos → VARIOS DE ARQUITECTURA ahora tiene ${t.n} (venta ${t.venta})`);
  }
  await db.query(APLICAR ? 'COMMIT' : 'ROLLBACK');
  console.log(APLICAR ? 'APLICADO.' : 'SIMULACIÓN: se revirtió. Agrega --aplicar.');
} catch (e) { await db.query('ROLLBACK').catch(() => {}); console.error('ERROR:', e.message); process.exitCode = 1; } finally { await db.end(); }
