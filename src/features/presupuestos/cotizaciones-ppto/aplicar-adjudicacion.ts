import { BadRequestException, ConflictException } from '@nestjs/common';
import { AlmacenSql, B, I, IN, T, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';
import { csv } from '../../almacen/shared/oc-saldos.js';
import { estaCubierto, compromisosDeItems, type PresupuestoBloqueado } from './contexto-ppto.js';
import { validarAdjudicable, type ItemFase } from './adjudicacion.js';

export interface CambioAdjudicacion {
  idItem: number;
  /** `ppto_cotizacion_detalle.id` que gana el ítem; `null` = quitar el ganador. */
  idCotDetalle: number | null;
}

export interface ResultadoAdjudicacion {
  adjudicados: number;
  liberados: number;
  sinCambio: number;
}

/**
 * Elige (o quita) el ganador de ítems del presupuesto, dentro de la transacción del llamador y con el presupuesto bloqueado.
 * Escribe quién, cuándo y por qué (`adjudicado_por`, `fecha_adjudicacion`, `comentario_adjudicacion`).
 * No concilia compromisos: eso lo hace el llamador al final de su transacción.
 */
export async function aplicarAdjudicacion(
  sql: AlmacenSql,
  tx: Tx,
  p: { presupuesto: PresupuestoBloqueado; cambios: readonly CambioAdjudicacion[]; usuario: string; comentario: string | null },
): Promise<ResultadoAdjudicacion> {
  const resultado: ResultadoAdjudicacion = { adjudicados: 0, liberados: 0, sinCambio: 0 };
  if (p.cambios.length === 0) return resultado;
  const q = sqlTag(sql);

  const idsItem = p.cambios.map((c) => c.idItem);
  if (new Set(idsItem).size !== idsItem.length) throw new BadRequestException('Hay ítems repetidos en la adjudicación');

  const items = await q.rows<{ id: number; id_fase: number; cantidad: string; codigo: string; ganadora: number | null }>(
    { id: I, id_fase: I, cantidad: T, codigo: T, ganadora: IN },
    tx,
  )`
    SELECT i.id, f.id AS id_fase, i."Cantidad"::text AS cantidad, p.codigo::text AS codigo, i.id_ppto_cot_detalle_ganadora AS ganadora
      FROM "ppto_DetalleItems" i
      JOIN "ppto_DetalleFasesCate" c ON c.id = i.id_detalle_categoria
      JOIN "ppto_DetalleFases" f ON f."IdPresupuestoDetalle" = c."IdPresupuestoDetalle"
      JOIN producto p ON p.id = i.id_producto
     WHERE i."IdPresupuesto" = ${p.presupuesto.codigo}::text AND f."IdPresupuesto" = ${p.presupuesto.codigo}::text
       AND i.id = ANY(string_to_array(${csv(idsItem)}::text, ',')::int[])`;
  const porItem = new Map(items.map((i) => [i.id, i]));
  for (const id of idsItem) {
    if (!porItem.has(id)) throw new BadRequestException(`El ítem ${id} no pertenece al presupuesto ${p.presupuesto.codigo}`);
  }

  const compromisos = await compromisosDeItems(sql, idsItem, tx);

  const idsCot = p.cambios.map((c) => c.idCotDetalle).filter((c): c is number => c !== null);
  const lineas = new Map<number, { id_ppto_item: number; cotiza: boolean; cantidad: string; id_presupuesto: number; id_detalle_fase: number }>();
  if (idsCot.length > 0) {
    const filas = await q.rows<{ id: number; id_ppto_item: number; cotiza: boolean; cantidad: string; id_presupuesto: number; id_detalle_fase: number }>(
      { id: I, id_ppto_item: I, cotiza: B, cantidad: T, id_presupuesto: I, id_detalle_fase: I },
      tx,
    )`
      SELECT d.id, d.id_ppto_item, d.cotiza, d.cantidad::text AS cantidad, c.id_presupuesto, c.id_detalle_fase
        FROM ppto_cotizacion_detalle d JOIN ppto_cotizacion c ON c.id = d.id_cotizacion
       WHERE d.id = ANY(string_to_array(${csv(idsCot)}::text, ',')::int[])`;
    for (const f of filas) lineas.set(f.id, f);
  }

  for (const cambio of p.cambios) {
    const item = porItem.get(cambio.idItem)!;
    const regla: ItemFase = {
      id: item.id,
      cantidad: Number(item.cantidad),
      cubierto: estaCubierto(compromisos.get(item.id)),
      etiqueta: item.codigo,
    };

    if (cambio.idCotDetalle === null) {
      if (regla.cubierto) {
        throw new ConflictException(`El ítem ${regla.etiqueta} ya tiene una orden registrada: anúlela antes de quitarle el proveedor`);
      }
      if (item.ganadora === null) {
        resultado.sinCambio += 1;
        continue;
      }
      await q.run(tx)`
        UPDATE "ppto_DetalleItems"
           SET id_ppto_cot_detalle_ganadora = NULL, adjudicado_por = NULL, fecha_adjudicacion = NULL, comentario_adjudicacion = NULL
         WHERE id = ${item.id}::int`;
      resultado.liberados += 1;
      continue;
    }

    const linea = lineas.get(cambio.idCotDetalle);
    if (!linea) throw new BadRequestException(`La oferta ${cambio.idCotDetalle} no existe`);
    if (linea.id_ppto_item !== item.id) {
      throw new BadRequestException(`La oferta ${cambio.idCotDetalle} es de otro ítem, no del ${regla.etiqueta}`);
    }
    if (linea.id_presupuesto !== p.presupuesto.id) {
      throw new BadRequestException(`La oferta ${cambio.idCotDetalle} es de otro presupuesto`);
    }
    if (linea.id_detalle_fase !== item.id_fase) {
      throw new BadRequestException(`La oferta ${cambio.idCotDetalle} es de otra fase`);
    }
    if (item.ganadora === cambio.idCotDetalle) {
      resultado.sinCambio += 1;
      continue;
    }
    validarAdjudicable(regla, { cotiza: linea.cotiza, cantidad: Number(linea.cantidad) });

    await q.run(tx)`
      UPDATE "ppto_DetalleItems"
         SET id_ppto_cot_detalle_ganadora = ${cambio.idCotDetalle}::int, adjudicado_por = ${p.usuario}::text,
             fecha_adjudicacion = now(), comentario_adjudicacion = NULLIF(${p.comentario ?? ''}::text, '')
       WHERE id = ${item.id}::int`;
    resultado.adjudicados += 1;
  }
  return resultado;
}
