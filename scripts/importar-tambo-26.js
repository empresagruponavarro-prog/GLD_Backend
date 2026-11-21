// Carga en la BD GLD (laptop o servidor) la data de 26 tiendas TAMBO que venía del Excel del sistema anterior (AppSheet).
// Los datos ya vienen filtrados y convertidos en scripts/tambo-26.datos.json (se generaron desde "Categorias (3).xlsx").
//
//   node scripts/importar-tambo-26.js [datos.json]            → simulación: ejecuta todo y revierte al final (no deja nada)
//   node scripts/importar-tambo-26.js [datos.json] --aplicar  → carga todo en UNA transacción (si algo falla, no queda nada)
// Sin archivo usa tambo-26.datos.json (1.ª tanda: 26 tiendas). La 2.ª tanda es tambo-26-b.datos.json (Huaycán, Mercaderes y
// las 2 filas alias de San Marcos Ampliación, que se suman al CC ya creado en la 1.ª).
//
// Qué crea: 26 centros de costo (con su lista de planos requeridos, como al crearlos desde la pantalla) y, ligado a ellos,
// en las tablas legacy: contrataciones, contrataciones_PPTOMeta, docCompra (+detalle), cajaEgresosRetail, egresos_DocCompra
// y los catálogos que esas filas referencian (monedas, bancos, cuentasCajaBancos, cajaMotivos, tipoDocumentoSunat).
// Si el CC trae presupuesto en el Excel también carga ppto_Principal/fases/categorías y docVenta. NO toca documentosOrigen (OC/OS), anexos ni productos.
// Lee DATABASE_URL del .env del backend. Busca todo por nombre/código (no usa IDs de otra base).
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const APLICAR = process.argv.includes('--aplicar');
const aqui = path.dirname(fileURLToPath(import.meta.url));
const archivo = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'tambo-26.datos.json';
const datos = JSON.parse(fs.readFileSync(path.resolve(aqui, archivo), 'utf-8'));

const CLIENTE = { nombre: 'TIENDAS TAMBO S.A.C.', ruc: '20603720882' };
const EMPRESA_POR_COD = { E1: 1, E2: 2, E3: 3, E4: 4 };
// Orden: catálogos primero, luego lo que depende de ellos.
const TABLAS = [
  'monedas',
  'bancos',
  'cuentasCajaBancos',
  'cajaMotivos',
  'tipoDocumentoSunat',
  'contrataciones',
  'contrataciones_PPTOMeta',
  'ppto_Principal',
  'ppto_DetalleFases',
  'ppto_DetalleFasesCate',
  'docVenta',
  'docVentaDetalle',
  'docCompra',
  'docCompraDetalle',
  'cajaEgresosRetail',
  'egresos_DocCompra',
];
// Tabla -> columna clave del catálogo (para no duplicar si ya existiera).
const CLAVE_CATALOGO = { monedas: 'MonedaId', bancos: 'IdBanco', cuentasCajaBancos: 'IdCtaCajaBanco', cajaMotivos: 'CodMotivo', tipoDocumentoSunat: 'CodDocSunat' };

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const abortar = async (msg) => {
  console.error('\nNO SE PUEDE CONTINUAR: ' + msg);
  await db.query('ROLLBACK').catch(() => {});
  await db.end();
  process.exit(1);
};

await db.query('BEGIN');
try {
  // ---- resolver referencias por nombre/código ----
  const tipo = await q(`select id from tipo_proyecto where nombre = 'TAMBO'`);
  if (tipo.length !== 1) await abortar('no hay exactamente un tipo de proyecto TAMBO');
  const cliente = await q(`select id from anexos where "Anexo" = $1 and "NumeroDocIde" = $2 and "tipoAnexo" = 'Cliente'`, [CLIENTE.nombre, CLIENTE.ruc]);
  if (cliente.length !== 1) await abortar(`el cliente ${CLIENTE.nombre} no está (o está repetido) en anexos: ${cliente.length}`);
  const principales = new Map((await q(`select id, centro_costo_principal as cod from centro_costos_principal`)).map((r) => [r.cod, r.id]));
  const empresas = new Set((await q(`select id_empresa from empresas`)).map((r) => r.id_empresa));

  // ---- evitar duplicar una carga anterior ----
  const nombres = datos.centros.map((c) => c.centro_costo);
  const ya = await q(`select id, centro_costo from "CentroCostos" where upper(centro_costo) = any($1::text[])`, [nombres.map((n) => n.toUpperCase())]);
  if (ya.length) await abortar(`ya existen ${ya.length} de estos centros de costo (p. ej. "${ya[0].centro_costo}", id ${ya[0].id}). No se carga dos veces.`);
  const pptos = (datos.tablas.ppto_Principal ?? []).map((r) => r.IdPresupuesto);
  const yaPptos = await q(`select count(*)::int n from "ppto_Principal" where "IdPresupuesto" = any($1::text[])`, [pptos]);
  if (yaPptos[0].n > 0) await abortar(`ya hay ${yaPptos[0].n} presupuestos de esta carga en ppto_Principal.`);
  const docs = datos.tablas.docCompra.map((r) => r.IdDocCompra);
  // Una factura compartida entre tiendas de dos tandas ya tiene cabecera: no se repite, solo se suman sus detalles.
  const yaDocs = new Set((await q(`select "IdDocCompra" k from "docCompra" where "IdDocCompra" = any($1::text[])`, [docs])).map((r) => r.k));
  const detalleYa = await q(`select count(*)::int n from "docCompraDetalle" where "IdDocCompraDetalle" = any($1::text[])`, [datos.tablas.docCompraDetalle.map((r) => r.IdDocCompraDetalle)]);
  if (detalleYa[0].n > 0) await abortar(`ya hay ${detalleYa[0].n} detalles de compra de esta carga: no se carga dos veces.`);

  // ---- centros de costo ----
  const idPorCodigo = new Map();
  for (const c of datos.centros) {
    const idEmpresa = EMPRESA_POR_COD[c.cod_empresa];
    if (!empresas.has(idEmpresa)) await abortar(`la empresa ${c.cod_empresa} (id ${idEmpresa}) no existe en esta base`);
    const idPrincipal = principales.get(c.cod_principal);
    if (!idPrincipal) await abortar(`no existe el centro de costo principal ${c.cod_principal} (${c.centro_costo})`);
    const r = await q(
      `insert into "CentroCostos"
         (periodo, cod_cliente, id_centro_costos_principal, centro_costo, estado, fecha_inicio, fecha_fin_prog, fecha_fin_real,
          presupuesto_estado, presupuesto_costo_directo, presupuesto_gastos_generales, presupuesto_viaticos, presupuesto_monto,
          oc_file, id_empresa, id_anexo, id_tipo_proyecto)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning id`,
      [
        c.periodo, CLIENTE.nombre, idPrincipal, c.centro_costo, c.estado || 'ABIERTO', c.fecha_inicio, c.fecha_fin_prog, c.fecha_fin_real,
        c.presupuesto_estado, c.presupuesto_costo_directo, c.presupuesto_gastos_generales, c.presupuesto_viaticos, c.presupuesto_monto,
        c.oc_file, idEmpresa, cliente[0].id, tipo[0].id,
      ],
    );
    idPorCodigo.set(c.cod_legacy, r[0].id);
  }
  // Filas del Excel que son la misma tienda de un CC que ya existe: se suman a ese CC.
  const idsAlias = [];
  for (const [codigo, nombre] of Object.entries(datos.alias ?? {})) {
    const e = await q(`select id from "CentroCostos" where upper(centro_costo) = upper($1)`, [nombre]);
    if (e.length !== 1) await abortar(`el CC "${nombre}" (alias ${codigo}) debería existir una sola vez y hay ${e.length}`);
    idPorCodigo.set(codigo, e[0].id);
    idsAlias.push(e[0].id);
  }
  // Lista de planos requeridos del tipo de proyecto (igual que al crear el CC desde la pantalla).
  const ids = datos.centros.map((c) => idPorCodigo.get(c.cod_legacy));
  const planos = await q(
    `insert into obra_plano_requerido (id_centro_costo, id_tipo_plano, obligatorio)
     select cc.id, tp.id_tipo_plano, tp.obligatorio
       from "CentroCostos" cc join tipo_proyecto_plano tp on tp.id_tipo_proyecto = cc.id_tipo_proyecto
      where cc.id = any($1::int[]) returning id`,
    [ids],
  );
  const idsControl = [...ids, ...idsAlias];

  // ---- tablas ligadas ----
  const resumen = [];
  for (const tabla of TABLAS) {
    let filas = datos.tablas[tabla] ?? [];
    if (!filas.length) continue;
    const clave = CLAVE_CATALOGO[tabla];
    if (clave) {
      const existentes = new Set((await q(`select "${clave}" k from "${tabla}"`)).map((r) => r.k));
      filas = filas.filter((f) => !existentes.has(f[clave]));
    }
    if (tabla === 'docCompra') filas = filas.filter((f) => !yaDocs.has(f.IdDocCompra));
    if (!filas.length) continue;
    // El id interno del CC sale del código legacy que trae cada fila (cuando la tabla lo tiene).
    const tieneIdCc = (await q(`select 1 from information_schema.columns where table_name = $1 and column_name = 'id_centro_costo'`, [tabla])).length > 0;
    let sinCc = 0;
    if (tieneIdCc) {
      filas = filas.map((f) => {
        const id = idPorCodigo.get(f.CodCentroCto);
        if (!id) sinCc++;
        return id ? { ...f, id_centro_costo: id } : f;
      });
    }
    const columnas = [...new Set(filas.flatMap((f) => Object.keys(f)))];
    const lista = columnas.map((c) => `"${c}"`).join(', ');
    let insertadas = 0;
    for (let i = 0; i < filas.length; i += 500) {
      const lote = filas.slice(i, i + 500);
      const r = await db.query(
        `insert into "${tabla}" (${lista}) select ${lista} from jsonb_populate_recordset(null::"${tabla}", $1::jsonb)`,
        [JSON.stringify(lote)],
      );
      insertadas += r.rowCount ?? 0;
    }
    if (insertadas !== filas.length) await abortar(`${tabla}: se esperaban ${filas.length} filas y se insertaron ${insertadas}`);
    resumen.push({ tabla, filas: insertadas, sin_centro_costo: tieneIdCc ? sinCc : '-' });
  }

  // Las facturas que ahora reparten detalles entre dos tandas quedan sin CC en la cabecera (compartidas).
  if (yaDocs.size) {
    await db.query(`update "docCompra" set id_centro_costo = null, "CodCentroCto" = null where "IdDocCompra" = any($1::text[])`, [[...yaDocs]]);
    console.log(`Facturas ya existentes que ahora son compartidas (cabecera sin CC): ${yaDocs.size}`);
  }

  // ---- verificación contra los datos de origen ----
  const control = await q(
    `select cc.centro_costo,
            (select count(*)::int from "docCompraDetalle" d where d.id_centro_costo = cc.id) as detalles_compra,
            (select coalesce(sum(d.monto),0)::numeric(14,2) from "docCompraDetalle" d where d.id_centro_costo = cc.id) as compras_monto,
            (select count(*)::int from "cajaEgresosRetail" e where e.id_centro_costo = cc.id) as egresos,
            (select coalesce(sum(e."Monto Total"),0)::numeric(14,2) from "cajaEgresosRetail" e where e.id_centro_costo = cc.id) as egresos_monto,
            (select count(*)::int from "contrataciones_PPTOMeta" m where m.id_centro_costo = cc.id) as ppto_meta
       from "CentroCostos" cc where cc.id = any($1::int[]) order by cc.id`,
    [idsControl],
  );

  console.log(`\nCentros de costo creados: ${ids.length} (+${idsAlias.length} alias sumados a un CC existente)  |  planos requeridos: ${planos.length}`);
  console.table(resumen);
  console.table(control);
  console.log('Nota: contrataciones no tiene id_centro_costo (solo CentroCosto = código legacy); se une por Codcontratacion con contrataciones_PPTOMeta.');

  if (APLICAR) {
    await db.query('COMMIT');
    console.log('\nAPLICADO: todo quedó guardado.');
  } else {
    await db.query('ROLLBACK');
    console.log('\nSIMULACIÓN: todo se revirtió, no quedó nada. Para guardar: node scripts/importar-tambo-26.js --aplicar');
  }
} catch (e) {
  await db.query('ROLLBACK').catch(() => {});
  console.error('\nERROR, se revirtió todo:', e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
