import 'dotenv/config';
import fs from 'node:fs';
import pg from 'pg';
const { meta } = JSON.parse(fs.readFileSync('C:/Users/GADLA1~1/AppData/Local/Temp/claude/232ac2390bad7807/b078a33c-d209-427d-860f-e28215ee7f3c/scratchpad/meta-cats.json','utf-8'));
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const pref = (s) => (String(s).match(/^\s*(\d+)\s*\./) ?? [])[1] ?? null;
const bi = (s) => { s = norm(s).replace(/[^A-Z0-9 ]/g,''); const m = new Map(); for (let i=0;i<s.length-1;i++){const g=s.slice(i,i+2); m.set(g,(m.get(g)??0)+1);} return m; };
const dice = (a,b) => { const A=bi(a),B=bi(b); let inter=0,ta=0,tb=0; for (const [g,n] of A){ta+=n; inter+=Math.min(n,B.get(g)??0);} for (const n of B.values()) tb+=n; return ta+tb? 2*inter/(ta+tb):0; };
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const q = async (s, p = []) => (await db.query(s, p)).rows;
console.table(await q(`select c.id, c.codigo, left(c.descripcion,70) d, (select count(*) from producto p where p.id_categoria=c.id) n from categoria c where c.descripcion ~ '^[0-9]+\.' order by substring(c.descripcion from '^[0-9]+')::int, c.id`));
const rows = await q(`select i.id iid, f."IdpptoFase" fase, i."Item" item, p.id pid, p.codigo, p.descripcion, c.id cid, c.descripcion cat, i.id_producto from "ppto_Plantillas_Items" i join "ppto_Plantillas_Categorias" pc on pc.id=i.id_plantilla_categoria join "ppto_Plantillas_Fases" f on f."IdPlantillaFase"=pc."IdPlantillaFase" join producto p on p.id=i.id_producto join categoria c on c.id=p.id_categoria where f."IdPlantilla"='TPL-TAMBO-COMAS-R4'`);
const res = []; let match=0, ok=0, nomatch=[];
const vistos = new Set();
for (const m of meta) {
  const cand = rows.filter(r => (r.fase==='9c249cf7'?0:1)===m.fase);
  let best=null, bs=0;
  for (const r of cand) { let s = dice(r.descripcion, m.desc); if (r.item===m.item) s += 0.05; if (s>bs){bs=s;best=r;} }
  if (!best || bs<0.8) { nomatch.push(m); continue; }
  match++;
  if (vistos.has(best.pid+'|'+m.cat)) continue; vistos.add(best.pid+'|'+m.cat);
  if (pref(best.cat)===pref(m.cat)) ok++; else res.push({ pid: best.pid, codigo: best.codigo, desc: best.descripcion.slice(0,50), sist: best.cat.slice(0,34), excel: m.cat.slice(0,34), excelDesc: m.desc.slice(0,30) });
}
console.log({ filasExcel: meta.length, conProducto: match, sinProducto: nomatch.length, catOk: ok, catDistinta: res.length });
fs.writeFileSync('C:/Users/GADLA1~1/AppData/Local/Temp/claude/232ac2390bad7807/b078a33c-d209-427d-860f-e28215ee7f3c/scratchpad/res.json', JSON.stringify({res,nomatch},null,1));
console.table(res.slice(0,80));
await db.end();
