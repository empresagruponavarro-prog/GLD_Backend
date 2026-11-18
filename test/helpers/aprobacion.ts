import type { apiConSesion } from './sesion.js';
import { USUARIO_E2E } from './sesion.js';

/** Lo único que el ayudante necesita del cliente `pg` de cada spec. */
interface ClienteSql {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, any>> }>;
}

/** Prefijo de lo que crea este ayudante (lo borra `borrarUsuarioE2E`). */
export const PREFIJO_ADJ = 'E2E-ADJ';

/**
 * Plan 09 (D-11): un presupuesto no se aprueba mientras tenga ítems sin proveedor ganador. Las pruebas del recorrido anterior
 * (presupuesto aprobado → «Generar FURs» → FUR → orden) quieren un presupuesto **aprobado y sin adjudicar**, que es lo que
 * existe en los datos anteriores a este plan.
 *
 * `aprobarE2E` adjudica todo por SQL, aprueba por la API y **revierte** lo que la aprobación generó (FUR, órdenes, cotizaciones
 * y ganadores), de modo que el presupuesto queda aprobado y sin adjudicar. Devuelve la respuesta de la aprobación, ya revertido.
 */
export async function aprobarE2E(api: ReturnType<typeof apiConSesion>, db: ClienteSql, codigo: string, esperado = 200) {
  const idTrabajador = await asegurarAnexo(db, 'Trabajador', `${PREFIJO_ADJ} Trabajador`);
  await db.query(`insert into trabajador (id_anexo) values ($1) on conflict (id_anexo) do nothing`, [idTrabajador]);
  await db.query(`update usuarios set id_trabajador = $1 where "IdUsuario" = $2`, [idTrabajador, USUARIO_E2E]);
  const idProveedor = await asegurarAnexo(db, 'Proveedor', `${PREFIJO_ADJ} Proveedor`);

  const ppto = (await db.query(`select id from "ppto_Principal" where "IdPresupuesto" = $1`, [codigo])).rows[0];
  if (!ppto) throw new Error(`Presupuesto ${codigo} no existe`);
  await adjudicarTodo(db, ppto.id, codigo, idProveedor);
  try {
    const res = await api.post(`/presupuestos/${codigo}/aprobar`);
    expect(res.status, JSON.stringify(res.body)).toBe(esperado);
    return res;
  } finally {
    await revertir(db, ppto.id, codigo);
  }
}

async function asegurarAnexo(db: ClienteSql, tipo: string, nombre: string): Promise<number> {
  const existe = (await db.query(`select id from anexos where "Anexo" = $1 and "tipoAnexo" = $2`, [nombre, tipo])).rows[0];
  if (existe) return existe.id;
  return (await db.query(`insert into anexos ("tipoAnexo", "Anexo", estado) values ($1, $2, true) returning id`, [tipo, nombre])).rows[0].id;
}

let contador = 0;

/** Una cotización por fase, con todos los ítems a su costo del Meta, y el proveedor como ganador de cada uno. */
async function adjudicarTodo(db: ClienteSql, idPpto: number, codigo: string, idProveedor: number): Promise<void> {
  const fases = (await db.query(`select id from "ppto_DetalleFases" where "IdPresupuesto" = $1 order by id`, [codigo])).rows;
  for (const f of fases) {
    const items = (
      await db.query(
        `select i.id, i."Cantidad"::text as cantidad, i."CostoUnitario"::text as costo
           from "ppto_DetalleItems" i
           join "ppto_DetalleFasesCate" c on c.id = i.id_detalle_categoria
           join "ppto_DetalleFases" fa on fa."IdPresupuestoDetalle" = c."IdPresupuestoDetalle"
          where fa.id = $1 and i."IdPresupuesto" = $2 and i."Cantidad" > 0`,
        [f.id, codigo],
      )
    ).rows;
    if (items.length === 0) continue;
    contador += 1;
    const numero = `${PREFIJO_ADJ}-${Date.now().toString(36).slice(-6)}${contador}`;
    const cot = (
      await db.query(
        `insert into ppto_cotizacion (numero, id_presupuesto, id_detalle_fase, id_proveedor, fecha, moneda_id, moneda_simbolo, forma_pago)
         values ($1, $2, $3, $4, current_date, 'PEN', 'S/', 'CONTADO') returning id`,
        [numero, idPpto, f.id, idProveedor],
      )
    ).rows[0].id;
    for (const it of items) {
      const linea = (
        await db.query(`insert into ppto_cotizacion_detalle (id_cotizacion, id_ppto_item, cantidad, precio_unitario) values ($1, $2, $3, $4) returning id`, [cot, it.id, it.cantidad, it.costo])
      ).rows[0].id;
      await db.query(`update "ppto_DetalleItems" set id_ppto_cot_detalle_ganadora = $1, adjudicado_por = 'e2e', fecha_adjudicacion = now() where id = $2`, [linea, it.id]);
    }
  }
}

/** Quita lo que generó la aprobación (FUR y órdenes de adjudicación) y las cotizaciones: el presupuesto vuelve a estar sin adjudicar. */
async function revertir(db: ClienteSql, idPpto: number, codigo: string): Promise<void> {
  const furs = `(select id from requerimiento where id_ppto_principal = ${idPpto} and origen = 'PPTO_ADJUDICACION')`;
  await db.query(`delete from pago_programado where id_documento_origen in (select id from "documentosOrigen" where id_requerimiento in ${furs})`);
  await db.query(`delete from "ordenCompraDetalle" where id_orden_compra in (select id from "documentosOrigen" where id_requerimiento in ${furs})`);
  await db.query(`delete from "documentosOrigen" where id_requerimiento in ${furs}`);
  await db.query(`update requerimiento set id_cotizacion_ganadora = null where id_ppto_principal = ${idPpto} and origen = 'PPTO_ADJUDICACION'`);
  await db.query(`delete from cotizacion where id_requerimiento in ${furs}`);
  await db.query(`delete from requerimiento where id_ppto_principal = ${idPpto} and origen = 'PPTO_ADJUDICACION'`);
  await db.query(
    `update "ppto_DetalleItems" set id_ppto_cot_detalle_ganadora = null, adjudicado_por = null, fecha_adjudicacion = null, comentario_adjudicacion = null where "IdPresupuesto" = $1`,
    [codigo],
  );
  await db.query(`delete from ppto_cotizacion where id_presupuesto = $1`, [idPpto]);
}
