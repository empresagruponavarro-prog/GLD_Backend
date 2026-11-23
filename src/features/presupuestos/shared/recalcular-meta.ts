import { AlmacenSql, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';

/**
 * Deja al día el Presupuesto Meta de un presupuesto (plan 11), en SQL por lote y dentro de la transacción de quien escribió el Base
 * o el Meta. Es la **única** función que escribe `CostoTotalMeta` y `CostoDirectoMeta`: todo cambio de ítems, subfases o fases pasa por
 * aquí, así el Meta no queda repartido entre cinco handlers. Las reglas son las de `costos-meta.ts`:
 *
 *  - **Ítem:** sin precio Meta propio (`CostoUnitarioMeta` nulo) su total Meta es su total Base; con precio propio,
 *    `cantidad × CostoUnitarioMeta`, cada factor a 2 decimales.
 *  - **Subfase con ítems:** suma del total Meta de sus ítems. Sin ítems no se toca: conserva el monto Meta escrito a mano (o `NULL` = Base).
 *  - **Fase con subfases:** suma del Meta efectivo de sus subfases (`COALESCE(Meta, Base, 0)`); sin subfases, `NULL` (= Base).
 *  - **Presupuesto con fases:** suma del Meta efectivo de sus fases; sin fases, `NULL` (= Base).
 *
 * Idempotente y sin escrituras en vano: cada `UPDATE` solo toca las filas cuyo valor cambia. Solo escribe columnas Meta; el Base
 * (`CostoUnitario`, `CostoTotal`, `CostoDirecto`) y todo lo que se calcula sobre él (GG, utilidad, IGV, total) no cambia (D-3).
 */

export interface OpcionesRecalcularMeta {
  /**
   * `ppto_DetalleFasesCate.id` de una subfase a la que se le **acaban de quitar todos los ítems**: su Meta (que era la suma de ellos)
   * vuelve a `NULL` (= Base). Sin esto quedaría con el total de ítems que ya no existen. No se pasa cuando la subfase ya estaba sin ítems,
   * porque entonces su Meta es un monto escrito a mano y debe conservarse.
   */
  reiniciarSubfaseSinItems?: number;
}

export interface ResultadoRecalcularMeta {
  /** Filas que cambiaron en cada nivel. */
  items: number;
  subfases: number;
  fases: number;
  presupuestos: number;
}

export async function recalcularMeta(
  sql: AlmacenSql,
  tx: Tx,
  codigoPresupuesto: string,
  opciones: OpcionesRecalcularMeta = {},
): Promise<ResultadoRecalcularMeta> {
  const run = sqlTag(sql).run(tx);
  const codigo = codigoPresupuesto;
  const resultado: ResultadoRecalcularMeta = { items: 0, subfases: 0, fases: 0, presupuestos: 0 };

  // 1) Ítems: sin precio Meta propio copian su total Base; con precio propio, cantidad × precio Meta (2 decimales cada factor).
  resultado.items += await run`
    UPDATE "ppto_DetalleItems" i
       SET "CostoTotalMeta" = n."total"
      FROM (
        SELECT x."id",
               CASE WHEN x."CostoUnitarioMeta" IS NULL THEN x."CostoTotal"
                    ELSE round(round(x."Cantidad", 2) * round(x."CostoUnitarioMeta", 2), 2) END AS "total"
          FROM "ppto_DetalleItems" x
         WHERE x."IdPresupuesto" = ${codigo}::text
      ) n
     WHERE i."id" = n."id" AND i."CostoTotalMeta" IS DISTINCT FROM n."total"`;

  // 2) Subfase a la que se le quitaron todos los ítems: su Meta era la suma de ellos y vuelve a ser el Base.
  if (opciones.reiniciarSubfaseSinItems !== undefined) {
    resultado.subfases += await run`
      UPDATE "ppto_DetalleFasesCate" c
         SET "CostoDirectoMeta" = NULL
       WHERE c."id" = ${opciones.reiniciarSubfaseSinItems}::int
         AND c."IdPresupuesto" = ${codigo}::text
         AND c."CostoDirectoMeta" IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM "ppto_DetalleItems" i WHERE i."id_detalle_categoria" = c."id")`;
  }

  // 3) Subfases con ítems: la suma del total Meta de sus ítems. (Las subfases sin ítems conservan su monto a mano.)
  resultado.subfases += await run`
    UPDATE "ppto_DetalleFasesCate" c
       SET "CostoDirectoMeta" = s."total"
      FROM (
        SELECT i."id_detalle_categoria" AS "id", sum(i."CostoTotalMeta") AS "total"
          FROM "ppto_DetalleItems" i
         WHERE i."IdPresupuesto" = ${codigo}::text
         GROUP BY i."id_detalle_categoria"
      ) s
     WHERE c."id" = s."id" AND c."IdPresupuesto" = ${codigo}::text AND c."CostoDirectoMeta" IS DISTINCT FROM s."total"`;

  // 4) Fases con subfases: la suma de su Meta efectivo (el propio de la subfase o, si no tiene, su Base).
  resultado.fases += await run`
    UPDATE "ppto_DetalleFases" f
       SET "CostoDirectoMeta" = s."total"
      FROM (
        SELECT c."IdPresupuestoDetalle" AS "detalle", sum(COALESCE(c."CostoDirectoMeta", c."CostoDirecto", 0)) AS "total"
          FROM "ppto_DetalleFasesCate" c
         WHERE c."IdPresupuesto" = ${codigo}::text
         GROUP BY c."IdPresupuestoDetalle"
      ) s
     WHERE f."IdPresupuestoDetalle" = s."detalle" AND f."IdPresupuesto" = ${codigo}::text
       AND f."CostoDirectoMeta" IS DISTINCT FROM s."total"`;

  // 5) Fases sin subfases: no hay nada que sumar, valen lo mismo que su Base.
  resultado.fases += await run`
    UPDATE "ppto_DetalleFases" f
       SET "CostoDirectoMeta" = NULL
     WHERE f."IdPresupuesto" = ${codigo}::text AND f."CostoDirectoMeta" IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM "ppto_DetalleFasesCate" c WHERE c."IdPresupuestoDetalle" = f."IdPresupuestoDetalle")`;

  // 6) Presupuesto con fases: la suma de su Meta efectivo.
  resultado.presupuestos += await run`
    UPDATE "ppto_Principal" p
       SET "CostoDirectoMeta" = s."total"
      FROM (
        SELECT sum(COALESCE(f."CostoDirectoMeta", f."CostoDirecto", 0)) AS "total"
          FROM "ppto_DetalleFases" f
         WHERE f."IdPresupuesto" = ${codigo}::text
        HAVING count(*) > 0
      ) s
     WHERE p."IdPresupuesto" = ${codigo}::text AND p."CostoDirectoMeta" IS DISTINCT FROM s."total"`;

  // 7) Presupuesto sin fases: vale lo mismo que su Base.
  resultado.presupuestos += await run`
    UPDATE "ppto_Principal" p
       SET "CostoDirectoMeta" = NULL
     WHERE p."IdPresupuesto" = ${codigo}::text AND p."CostoDirectoMeta" IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM "ppto_DetalleFases" f WHERE f."IdPresupuesto" = p."IdPresupuesto")`;

  return resultado;
}
