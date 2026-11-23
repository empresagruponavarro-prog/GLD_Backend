import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthUser } from '../../../platform/auth/jwt/auth-user.js';
import { exigirTrabajadorVinculado, trabajadorDelUsuario } from '../../../platform/auth/usuarios/trabajador-del-usuario.js';
import { AlmacenSql, B, I, T, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';
import { csv } from '../../almacen/shared/oc-saldos.js';
import { aplicarAdjudicacion, type CambioAdjudicacion } from './aplicar-adjudicacion.js';
import { sigueSiendoGanadora, type ItemFase } from './adjudicacion.js';
import { compromisosDeItems, estaCubierto, itemsDeSubpartida, type PresupuestoBloqueado } from './contexto-ppto.js';
import { prorratearTotal, type LineaProrrateada } from './prorrateo.js';
import { compararLineas, type CotizacionOmitida, type ResultadoReprorrateo } from './reprorrateo.js';

/**
 * Reparte (y vuelve a repartir) el total de una cotización de subpartida entre sus ítems según el costo Meta de cada uno (plan 09, plan 11).
 * Lo usan el registro de cotizaciones (`CotizacionPptoHandler`) y todo lo que cambia lo que las sostiene: el precio Meta de los ítems
 * (`presupuesto-meta/`) y los ítems del Base (`detalle-items`). Todo corre dentro de la transacción del llamador, con el presupuesto bloqueado.
 */
@Injectable()
export class ReprorrateoService {
  constructor(private readonly sql: AlmacenSql) {}

  /**
   * Reparte el total de la subpartida entre sus ítems según el costo Meta y devuelve las líneas que se guardan, junto con los ítems
   * de la subpartida tal como los ve la validación (cantidad y si ya tienen una orden registrada).
   */
  async prorratear(tx: Tx, ppto: PresupuestoBloqueado, idSubpartida: number, total: string): Promise<{ items: Map<number, ItemFase>; lineas: LineaProrrateada[] }> {
    const delaSubpartida = await itemsDeSubpartida(this.sql, ppto.codigo, idSubpartida, tx);
    const compromisos = await compromisosDeItems(
      this.sql,
      delaSubpartida.map((i) => i.id),
      tx,
    );
    const items = new Map<number, ItemFase>(
      delaSubpartida.map((i) => [i.id, { id: i.id, cantidad: Number(i.cantidad), cubierto: estaCubierto(compromisos.get(i.id)), etiqueta: i.codigo }]),
    );
    const lineas = prorratearTotal(
      Number(total),
      delaSubpartida.map((i) => ({ id: i.id, cantidad: Number(i.cantidad), costoTotal: Number(i.costo_total) })),
    );
    return { items, lineas };
  }

  /**
   * Ítems de la cotización que ya tienen una orden registrada. Una cotización que cubre un ítem así es evidencia de esa compra: no se
   * edita, no se elimina y tampoco se vuelve a repartir.
   */
  async itemsCubiertosDeCotizacion(tx: Tx, idCotizacion: number): Promise<{ cubiertos: number; documentos: string[] }> {
    const q = sqlTag(this.sql);
    const items = await q.rows<{ id: number }>({ id: I }, tx)`SELECT id_ppto_item AS id FROM ppto_cotizacion_detalle WHERE id_cotizacion = ${idCotizacion}::int`;
    const compromisos = await compromisosDeItems(
      this.sql,
      items.map((i) => i.id),
      tx,
    );
    const cubiertos = items.filter((i) => estaCubierto(compromisos.get(i.id)));
    const documentos = [...new Set(cubiertos.map((i) => compromisos.get(i.id)?.numero_documento).filter((n): n is string => !!n))];
    return { cubiertos: cubiertos.length, documentos };
  }

  async insertarLinea(tx: Tx, idCotizacion: number, l: LineaProrrateada): Promise<number> {
    const q = sqlTag(this.sql);
    const [fila] = await q.rows<{ id: number }>({ id: I }, tx)`
      INSERT INTO ppto_cotizacion_detalle (id_cotizacion, id_ppto_item, cotiza, cantidad, precio_unitario)
      VALUES (${idCotizacion}::int, ${l.id_ppto_item}::int, ${l.cotiza}::boolean, ${l.cantidad}::numeric, ${l.precio_unitario}::numeric)
      RETURNING id`;
    return fila.id;
  }

  /**
   * Deja las líneas de la cotización como las calculó el prorrateo **sin perder el ganador** de las que siguen: actualiza las que
   * ya estaban, agrega las nuevas y quita las que faltan (liberando su ítem). El ganador de una línea que dejó de ofrecer la
   * cantidad completa se suelta. Devuelve ítem -> línea.
   */
  async reemplazarLineas(tx: Tx, idCotizacion: number, lineas: LineaProrrateada[], items: Map<number, ItemFase>): Promise<Map<number, number>> {
    const q = sqlTag(this.sql);
    const existentes = await q.rows<{ id: number; id_ppto_item: number }>({ id: I, id_ppto_item: I }, tx)`
      SELECT id, id_ppto_item FROM ppto_cotizacion_detalle WHERE id_cotizacion = ${idCotizacion}::int`;
    const idLineaDeItem = new Map(existentes.map((e) => [e.id_ppto_item, e.id]));
    const nuevosItems = new Set(lineas.map((l) => l.id_ppto_item));

    // Las líneas que ya no vienen se quitan y sus ítems quedan sin ganador.
    const sobran = existentes.filter((e) => !nuevosItems.has(e.id_ppto_item)).map((e) => e.id);
    if (sobran.length > 0) {
      await this.soltarGanadorDeLineas(tx, sobran);
      await q.run(tx)`DELETE FROM ppto_cotizacion_detalle WHERE id = ANY(string_to_array(${csv(sobran)}::text, ',')::int[])`;
    }

    const resultado = new Map<number, number>();
    for (const l of lineas) {
      const idExistente = idLineaDeItem.get(l.id_ppto_item);
      if (idExistente === undefined) {
        resultado.set(l.id_ppto_item, await this.insertarLinea(tx, idCotizacion, l));
        continue;
      }
      await q.run(tx)`
        UPDATE ppto_cotizacion_detalle
           SET cotiza = ${l.cotiza}::boolean, cantidad = ${l.cantidad}::numeric, precio_unitario = ${l.precio_unitario}::numeric
         WHERE id = ${idExistente}::int`;
      resultado.set(l.id_ppto_item, idExistente);

      // ¿Seguía ganando este ítem? Si ya no ofrece la cantidad completa, lo pierde.
      const item = items.get(l.id_ppto_item);
      if (item && !sigueSiendoGanadora({ cotiza: l.cotiza, cantidad: Number(l.cantidad) }, item.cantidad)) {
        await q.run(tx)`
          UPDATE "ppto_DetalleItems"
             SET id_ppto_cot_detalle_ganadora = NULL, adjudicado_por = NULL, fecha_adjudicacion = NULL, comentario_adjudicacion = NULL
           WHERE id = ${l.id_ppto_item}::int AND id_ppto_cot_detalle_ganadora = ${idExistente}::int`;
      }
    }
    return resultado;
  }

  /** Quita el ganador (y su trazabilidad) de los ítems cuyo ganador es alguna de estas líneas de cotización. */
  async soltarGanadorDeLineas(tx: Tx, idsLinea: number[]): Promise<void> {
    if (idsLinea.length === 0) return;
    const q = sqlTag(this.sql);
    await q.run(tx)`
      UPDATE "ppto_DetalleItems"
         SET id_ppto_cot_detalle_ganadora = NULL, adjudicado_por = NULL, fecha_adjudicacion = NULL, comentario_adjudicacion = NULL
       WHERE id_ppto_cot_detalle_ganadora = ANY(string_to_array(${csv(idsLinea)}::text, ',')::int[])`;
  }

  /**
   * Una cotización que ya gana la subpartida y se vuelve a prorratear puede traer líneas de ítems nuevos (se agregaron a la subpartida
   * después de cotizar): esos ítems pasan también a su proveedor, para que la subpartida no quede ganada a medias. Solo exige el
   * trabajador vinculado si de verdad hay algo que adjudicar.
   *
   * `soloItems` limita lo que se adjudica a esos ítems (los que ingresaron al reparto): un ítem que ya cotizaba y quedó sin ganador porque
   * se le cambió el producto no se readjudica solo.
   */
  async completarGanadora(
    tx: Tx,
    ppto: PresupuestoBloqueado,
    idCotizacion: number,
    user: AuthUser | undefined,
    soloItems?: ReadonlySet<number>,
  ): Promise<void> {
    const q = sqlTag(this.sql);
    const filas = await q.rows<{ id: number; id_ppto_item: number; gana: boolean; libre: boolean }>({ id: I, id_ppto_item: I, gana: B, libre: B }, tx)`
      SELECT d.id, d.id_ppto_item, COALESCE(i.id_ppto_cot_detalle_ganadora = d.id, false) AS gana, (i.id_ppto_cot_detalle_ganadora IS NULL) AS libre
        FROM ppto_cotizacion_detalle d JOIN "ppto_DetalleItems" i ON i.id = d.id_ppto_item
       WHERE d.id_cotizacion = ${idCotizacion}::int AND d.cotiza`;
    if (!filas.some((f) => f.gana)) return;
    const cambios: CambioAdjudicacion[] = filas
      .filter((f) => f.libre && (soloItems === undefined || soloItems.has(f.id_ppto_item)))
      .map((f) => ({ idItem: f.id_ppto_item, idCotDetalle: f.id }));
    if (cambios.length === 0) return;
    if (user) await trabajadorDelUsuario(tx.orm.public, user.id, user.usuario);
    else exigirTrabajadorVinculado(null, '(sin sesión)');
    await aplicarAdjudicacion(this.sql, tx, { presupuesto: ppto, cambios, usuario: user?.usuario ?? 'SISTEMA', comentario: null });
  }

  /**
   * Vuelve a repartir las cotizaciones de una subpartida (plan 11, D-5) cuando cambió el precio Meta de sus ítems, sus cantidades o sus
   * ítems. El total que dio cada proveedor no cambia; solo cómo se reparte entre los ítems, a los pesos Meta de ahora.
   *  - Una cotización que cubre un ítem con orden registrada **se omite** (`ORDEN_REGISTRADA`): es evidencia de esa compra.
   *  - Si la subpartida ya no tiene base para repartir (sin ítems con cantidad o sin costo Meta) se omite (`SIN_BASE_PARA_REPARTIR`)
   *    **sin bloquear** quien guardó el Base o el Meta.
   *  - Solo se reescriben las cotizaciones que de verdad cambiaron. Los ítems que ingresan al reparto pasan al proveedor que ya gana la
   *    subpartida (ver `completarGanadora`).
   * No valida el estado del presupuesto: lo hace quien llama (solo se edita Base o Meta en `ESTADOS_EDITABLES`).
   */
  async reprorratearSubpartida(tx: Tx, ppto: PresupuestoBloqueado, idSubpartida: number, user: AuthUser | undefined): Promise<ResultadoReprorrateo> {
    const q = sqlTag(this.sql);
    const cotizaciones = await q.rows<{ id: number; numero: string; total_global: string }>({ id: I, numero: T, total_global: T }, tx)`
      SELECT id, numero::text AS numero, total_global::text AS total_global
        FROM ppto_cotizacion
       WHERE id_detalle_categoria = ${idSubpartida}::int AND prorrateada AND total_global IS NOT NULL
       ORDER BY id`;

    let actualizadas = 0;
    const omitidas: CotizacionOmitida[] = [];
    for (const c of cotizaciones) {
      if ((await this.itemsCubiertosDeCotizacion(tx, c.id)).cubiertos > 0) {
        omitidas.push({ id_cotizacion: c.id, numero: c.numero, motivo: 'ORDEN_REGISTRADA' });
        continue;
      }

      let prorrateo: { items: Map<number, ItemFase>; lineas: LineaProrrateada[] };
      try {
        prorrateo = await this.prorratear(tx, ppto, idSubpartida, c.total_global);
      } catch (e) {
        // `prorratearTotal` lanza 400 si no hay nada que repartir; es una regla de JS (no un error de SQL), así que la transacción sigue sana.
        if (!(e instanceof BadRequestException)) throw e;
        omitidas.push({ id_cotizacion: c.id, numero: c.numero, motivo: 'SIN_BASE_PARA_REPARTIR' });
        continue;
      }

      const guardadas = await q.rows<{ id_ppto_item: number; cotiza: boolean; cantidad: string; precio_unitario: string }>(
        { id_ppto_item: I, cotiza: B, cantidad: T, precio_unitario: T },
        tx,
      )`
        SELECT id_ppto_item, cotiza, cantidad::text AS cantidad, precio_unitario::text AS precio_unitario
          FROM ppto_cotizacion_detalle WHERE id_cotizacion = ${c.id}::int`;
      const { cambio, ingresan } = compararLineas(
        guardadas.map((g) => ({ id_ppto_item: g.id_ppto_item, cotiza: g.cotiza, cantidad: Number(g.cantidad), precio_unitario: Number(g.precio_unitario) })),
        prorrateo.lineas,
      );
      if (!cambio) continue;

      await this.reemplazarLineas(tx, c.id, prorrateo.lineas, prorrateo.items);
      if (ingresan.length > 0) await this.completarGanadora(tx, ppto, c.id, user, new Set(ingresan));
      actualizadas += 1;
    }
    return { actualizadas, omitidas };
  }
}
