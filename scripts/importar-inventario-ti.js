// Carga el inventario de equipos tecnológicos en cualquier base GLD (laptop o servidor).
// Busca todo por nombre (no usa IDs de otra base) y crea lo que falta.
//
//   node scripts/importar-inventario-ti.js                 → simulación: muestra qué haría, no escribe nada
//   node scripts/importar-inventario-ti.js --aplicar       → carga todo en una transacción (si algo falla, no queda nada)
//   node scripts/importar-inventario-ti.js --aplicar --forzar   → permite cargar aunque ya haya equipos
//
// Lee DATABASE_URL del .env del backend y los datos de scripts/inventario-ti.datos.json.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const PROBAR_ = process.argv.includes('--probar');
const APLICAR = process.argv.includes('--aplicar') || PROBAR_;
const FORZAR = process.argv.includes('--forzar');
// --probar: ejecuta las escrituras reales y al final las revierte (para ensayar sin dejar nada).
const PROBAR = process.argv.includes('--probar');
const aqui = path.dirname(fileURLToPath(import.meta.url));
const datos = JSON.parse(fs.readFileSync(path.join(aqui, 'inventario-ti.datos.json'), 'utf-8'));
const HOY = new Date().toISOString().slice(0, 10);

const alnum = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const tokens = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
const aviso = [];
const log = (...a) => console.log(...a);

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;

function abortar(msg) {
  console.error('\nNO SE PUEDE CONTINUAR: ' + msg);
  process.exit(1);
}

// En simulación se lee todo y no se escribe nada: las escrituras devuelven IDs ficticios negativos.
let ficticio = 0;
const nuevoId = () => --ficticio;
async function escribir(sql, params = []) {
  if (!APLICAR) return [{ id: nuevoId() }];
  return q(sql, params);
}

await db.query('begin');
try {
  // ── Comprobaciones previas ────────────────────────────────────────────────
  const tablas = await q(`select table_name from information_schema.tables where table_schema='public' and table_name in ('activo_fijo','activo_fijo_caracteristica','activo_fijo_historial','producto_caracteristica','ubicacion','local','nivel','ambiente','area')`);
  const faltan = ['activo_fijo', 'activo_fijo_caracteristica', 'activo_fijo_historial', 'producto_caracteristica', 'ubicacion', 'local', 'nivel', 'ambiente', 'area'].filter((t) => !tablas.some((x) => x.table_name === t));
  if (faltan.length) abortar(`faltan tablas (${faltan.join(', ')}). Ejecuta primero planes/12-servidor-ddl-equipos.sql`);
  const cols = await q(`select column_name from information_schema.columns where table_name='activo_fijo'`);
  for (const c of ['id_area', 'id_empresa', 'id_centro_costo']) if (!cols.some((x) => x.column_name === c)) abortar(`activo_fijo no tiene la columna ${c}. Ejecuta primero planes/12-servidor-ddl-equipos.sql`);
  const [{ n: existentes }] = await q(`select count(*)::int n from activo_fijo`);
  if (existentes > 0 && !FORZAR) abortar(`activo_fijo ya tiene ${existentes} equipos. Si de verdad quieres cargar encima, agrega --forzar.`);

  // ── Empresa, local, niveles, ambiente «POR DEFINIR», ubicaciones ──────────
  const empresa = (await q(`select id_empresa from empresas where razon_social = $1`, [datos.empresa]))[0];
  if (!empresa) abortar(`no existe la empresa "${datos.empresa}" en la tabla empresas`);
  let local = (await q(`select id, codigo from local where nombre = $1`, [datos.empresa]))[0];
  if (!local) {
    local = (await escribir(`insert into local (codigo, nombre, id_empresa, estado) values ($1,$2,$3,true) returning id, codigo`, [`EMP-${empresa.id_empresa}`, datos.empresa, empresa.id_empresa]))[0];
    local.codigo = local.codigo ?? `EMP-${empresa.id_empresa}`;
    log(`+ local "${datos.empresa}"`);
  }
  const niveles = {};
  for (const [i, nombre] of ['PISO 1', 'PISO 2'].entries()) {
    let n = (await q(`select id, codigo from nivel where upper(descripcion) = $1`, [nombre]))[0];
    if (!n) {
      const codigo = `P-0${i + 1}`;
      n = (await escribir(`insert into nivel (codigo, descripcion, estado) values ($1,$2,true) returning id, codigo`, [codigo, nombre]))[0];
      n.codigo = n.codigo ?? codigo;
      log(`+ nivel ${nombre}`);
    }
    niveles[nombre] = n;
  }
  const ambientes = {};
  for (const nombre of ['POR DEFINIR', 'SISTEMAS', 'RRHH']) {
    let a = (await q(`select id, codigo from ambiente where upper(descripcion) = $1`, [nombre]))[0];
    if (!a && nombre === 'POR DEFINIR') {
      a = (await escribir(`insert into ambiente (codigo, descripcion, estado) values ('PD-01','POR DEFINIR',true) returning id, codigo`))[0];
      a.codigo = a.codigo ?? 'PD-01';
      log('+ ambiente POR DEFINIR');
    }
    if (a) ambientes[nombre] = a;
  }
  const ubicaciones = new Map();
  async function ubicacion(nivel, ambiente) {
    const clave = `${nivel}|${ambiente}`;
    if (ubicaciones.has(clave)) return ubicaciones.get(clave);
    let amb = ambientes[ambiente];
    let u = amb ? (await q(`select id from ubicacion where id_local=$1 and id_nivel=$2 and id_ambiente=$3`, [local.id, niveles[nivel].id, amb.id]))[0] : null;
    if (!u && ambiente !== 'POR DEFINIR') {
      aviso.push(`No existe la ubicación ${ambiente} en ${nivel}; esos equipos van a POR DEFINIR.`);
      return ubicacion(nivel, 'POR DEFINIR');
    }
    if (!u) {
      amb = ambientes['POR DEFINIR'] ?? { id: -1, codigo: 'PD-01' };
      u = (await escribir(`insert into ubicacion (codigo, id_local, id_nivel, id_ambiente, id_area, estado) values ($1,$2,$3,$4,null,true) returning id`, [`${local.codigo}-${niveles[nivel].codigo}-${amb.codigo}`, local.id, niveles[nivel].id, amb.id]))[0];
      log(`+ ubicación ${nivel} · POR DEFINIR`);
    }
    ubicaciones.set(clave, u.id);
    return u.id;
  }

  // ── Áreas ─────────────────────────────────────────────────────────────────
  const areasBd = await q(`select id, nombre from area`);
  const areaId = new Map();
  for (const nombre of new Set(datos.equipos.map((e) => e.area).filter(Boolean))) {
    let a = areasBd.find((x) => alnum(x.nombre) === alnum(nombre));
    if (!a) {
      const codigo = datos.areasNuevas[nombre] ?? alnum(nombre).toUpperCase().slice(0, 20);
      a = (await escribir(`insert into area (codigo, nombre, estado) values ($1,$2,true) returning id`, [codigo, nombre]))[0];
      log(`+ área ${nombre}`);
    }
    areaId.set(nombre, a.id);
  }

  // ── Catálogo ──────────────────────────────────────────────────────────────
  const categoria = (await q(`select id from categoria where descripcion ilike '108. GG - INFORMATICA%' order by id limit 1`))[0];
  if (!categoria) abortar('no existe la categoría "108. GG - INFORMATICA…" para los equipos del catálogo');
  const unidad = (await q(`select id from unidad_medida where simbolo = 'und' order by id limit 1`))[0] ?? (await q(`select id from unidad_medida order by id limit 1`))[0];
  const almacen = (await q(`select id from almacen where codigo = 'ALM-GENERAL' limit 1`))[0] ?? (await q(`select id from almacen where estado order by id limit 1`))[0];
  if (!unidad || !almacen) abortar('falta una unidad de medida o un almacén activo');
  const productoId = new Map();
  const defs = [...datos.catalogo, ...datos.productosNuevos.map((p) => ({ codigo: p.codigo, descripcion: p.descripcion, caracteristicas: { Tipo: p.tipo } }))];
  for (const p of defs) {
    let fila = (await q(`select id from producto where codigo = $1`, [p.codigo]))[0];
    if (fila) {
      const tipo = (await q(`select valor from producto_caracteristica where id_producto=$1 and nombre='Tipo'`, [fila.id]))[0]?.valor;
      if (tipo && tipo !== p.caracteristicas.Tipo) aviso.push(`El producto ${p.codigo} ya existe con tipo "${tipo}" (se esperaba "${p.caracteristicas.Tipo}"). Revísalo.`);
    } else {
      fila = (await escribir(
        `insert into producto (codigo, descripcion, estado, id_categoria, id_unidad_medida, stock, tipo_producto, clase_inventario, costo_promedio, estado_operativo, id_almacen_default, stock_minimo, stock_objetivo) values ($1,$2,true,$3,$4,0,'PRODUCTO','ACTIVO_FIJO',0,'NORMAL',$5,0,0) returning id`,
        [p.codigo, p.descripcion, categoria.id, unidad.id, almacen.id],
      ))[0];
      for (const [nombre, valor] of Object.entries(p.caracteristicas)) await escribir(`insert into producto_caracteristica (id_producto, nombre, valor) values ($1,$2,$3)`, [fila.id, nombre, valor]);
      log(`+ catálogo ${p.codigo} (${p.caracteristicas.Tipo})`);
    }
    productoId.set(p.codigo, fila.id);
  }

  // ── Trabajadores ──────────────────────────────────────────────────────────
  const trabajadores = await q(`select id, "Anexo" nombre from anexos where "tipoAnexo" = 'Trabajador'`);
  const dni = (await q(`select id from "anexo_TipoDocIDE" where "Anexo_Documento_IDE" = 'DNI' and "TipoAnexo" = 'Trabajador' limit 1`))[0];
  const especialidades = await q(`select id, "Anexo Especialidad" nombre from "anexo_Especialidad" where "TipoAnexo" = 'Trabajador'`);
  const anexoId = new Map();
  let creados = 0;
  for (const [clave, p] of Object.entries(datos.personas)) {
    const hallados = trabajadores.filter((t) => tokens(t.nombre) === tokens(p.nombre)).sort((a, b) => a.id - b.id);
    if (hallados.length) {
      anexoId.set(clave, hallados[0].id);
      if (hallados.length > 1) aviso.push(`"${p.nombre}" está ${hallados.length} veces como Trabajador (${hallados.map((h) => h.id).join(', ')}); se usó el ${hallados[0].id}.`);
      continue;
    }
    const esp = p.especialidad ? especialidades.find((e) => alnum(e.nombre) === alnum(p.especialidad)) : null;
    if (p.especialidad && !esp) aviso.push(`No existe la especialidad "${p.especialidad}"; ${p.nombre} queda sin especialidad.`);
    const fila = (await escribir(`insert into anexos ("tipoAnexo","Anexo","NombreComercial","AnexoTipoDocIdeId","AnexoEspecialidadId",estado,exceptuado_retencion) values ('Trabajador',$1,$1,$2,$3,true,false) returning id`, [p.nombre, dni?.id ?? null, esp?.id ?? null]))[0];
    anexoId.set(clave, fila.id);
    creados++;
    log(`+ trabajador ${p.nombre}${p.crear ? '' : '  (¡esperado existente, no se encontró!)'}`);
    if (!p.crear) aviso.push(`${p.nombre} figuraba como trabajador existente pero no está en esta base; se creó.`);
  }

  // ── Equipos ───────────────────────────────────────────────────────────────
  const destino = `Empresa: ${datos.empresa}`;
  let n = 0;
  for (const e of datos.equipos) {
    const idUbic = await ubicacion(e.nivel, e.ambiente);
    const idResp = e.responsable ? anexoId.get(e.responsable) : null;
    const idArea = e.area ? areaId.get(e.area) : null;
    const id = APLICAR ? (await q(`select nextval('activo_fijo_id_seq') id`))[0].id : nuevoId();
    const codigo = `AF-${String(APLICAR ? id : n + 1).padStart(4, '0')}`;
    await escribir(
      `insert into activo_fijo (id, codigo, id_producto, serie, estado, fecha_asignacion, id_responsable, id_ubicacion, id_area, id_empresa, id_centro_costo) values ($1,$2,$3,null,'OPERATIVO',$4,$5,$6,$7,$8,null)`,
      [id, codigo, productoId.get(e.producto), idResp ? HOY : null, idResp, idUbic, idArea, empresa.id_empresa],
    );
    for (const [nombre, valor] of Object.entries(e.caracteristicas)) await escribir(`insert into activo_fijo_caracteristica (id_activo_fijo, nombre, valor) values ($1,$2,$3)`, [id, nombre, valor]);
    if (idResp) await escribir(`insert into activo_fijo_historial (id_activo_fijo, movimiento, fecha, id_responsable_nuevo, id_ubicacion_nueva, id_area_nueva, destino_nuevo) values ($1,'ASIGNACION',$2,$3,$4,$5,$6)`, [id, HOY, idResp, idUbic, idArea, destino]);
    n++;
  }

  if (APLICAR && !PROBAR) await db.query('commit');
  else await db.query('rollback');
  log(`\n${PROBAR ? 'ENSAYO (escrituras reales revertidas)' : APLICAR ? 'CARGADO' : 'SIMULACIÓN (no se escribió nada)'}: ${n} equipos, ${creados} trabajadores nuevos.`);
  if (aviso.length) log('\nAvisos:\n - ' + [...new Set(aviso)].join('\n - '));
} catch (err) {
  await db.query('rollback');
  console.error('ERROR, se revirtió todo:', err);
  process.exitCode = 1;
}
await db.end();
