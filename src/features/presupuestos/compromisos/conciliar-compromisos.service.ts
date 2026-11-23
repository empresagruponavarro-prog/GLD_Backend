import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthUser } from '../../../platform/auth/jwt/auth-user.js';
import { exigirTrabajadorVinculado, trabajadorDelUsuario } from '../../../platform/auth/usuarios/trabajador-del-usuario.js';
import { AlmacenSql, B, I, IN, T, TN, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';
import { csv } from '../../almacen/shared/oc-saldos.js';
import { InventarioLedger } from '../../almacen/shared/inventario-ledger.js';
import { calcularMontosDocumento, insertarDocumentoOrigen, insertarLineasDocumento, periodoYMes } from '../../documentos/shared/documento-origen-insert.js';
import { hoyLima } from '../../operaciones-obra/shared/obra-shared.js';
import { registrarEvento } from '../../requerimientos/shared/requerimiento-eventos.js';
import { preciosOferta } from '../../requerimientos/shared/precios-oferta.js';
import { ESTADOS_EDITABLES, type EstadoPpto } from '../aprobacion/estados.js';
import type { PresupuestoBloqueado } from '../cotizaciones-ppto/contexto-ppto.js';
import { coberturaPorOrigen, resolverCobertura } from './cobertura-origen.js';
import {
  agruparDeseados,
  claseDe,
  claveGrupo,
  firmaGrupo,
  planConciliacion,
  type CabeceraFirma,
  type ClaseOrden,
  type GrupoDeseado,
  type GrupoExistente,
  type ItemDeseado,
  type LineaFirma,
  type TipoProducto,
} from './plan-conciliacion.js';

export interface DocumentoCompromiso {
  id: number;
  numero_documento: string;
  clase: ClaseOrden;
}

export interface CompromisoGenerado {
  id_requerimiento: number;
  numero: string;
  fase: string;
  id_proveedor: number;
  proveedor: string | null;
  documentos: DocumentoCompromiso[];
}

export interface ResultadoConciliacion {
  creados: CompromisoGenerado[];
  actualizados: CompromisoGenerado[];
  anulados: Array<{ id_requerimiento: number; numero: string }>;
  sin_cambio: number;
}

/** Cabecera de la cotización ganadora (las mismas columnas que viajan al FUR y a la orden). */
interface CabeceraCotizacion extends CabeceraFirma {
  idCotizacion: number;
  proveedor: string | null;
}

interface FilaDeseada {
  id_item: number;
  id_detalle_fase: number;
  id_fase_maestra: number | null;
  fase: string;
  id_subfase: number;
  id_producto: number;
  codigo: string;
  tipo_producto: string;
  id_categoria: number;
  cantidad: string;
  costo_unitario: string;
  precio: string;
  g_plazo: number | null;
  g_marca: string | null;
  g_obs: string | null;
  id_cotizacion: number;
  id_proveedor: number;
  proveedor: string | null;
  fecha: string;
  referencia: string | null;
  moneda_id: string;
  moneda_simbolo: string | null;
  incluye_igv: boolean;
  afecto_igv: boolean;
  forma_pago: string;
  dias_credito: number;
  adelanto_porcentaje: string | null;
  medio_pago: string | null;
  plazo_entrega_dias: number | null;
  validez_dias: number | null;
  garantia: string | null;
  condiciones: string | null;
  archivo_url: string | null;
}

const DESEADA_SPEC = {
  id_item: I,
  id_detalle_fase: I,
  id_fase_maestra: IN,
  fase: T,
  id_subfase: I,
  id_producto: I,
  codigo: T,
  tipo_producto: T,
  id_categoria: I,
  cantidad: T,
  costo_unitario: T,
  precio: T,
  g_plazo: IN,
  g_marca: TN,
  g_obs: TN,
  id_cotizacion: I,
  id_proveedor: I,
  proveedor: TN,
  fecha: T,
  referencia: TN,
  moneda_id: T,
  moneda_simbolo: TN,
  incluye_igv: B,
  afecto_igv: B,
  forma_pago: T,
  dias_credito: I,
  adelanto_porcentaje: TN,
  medio_pago: TN,
  plazo_entrega_dias: IN,
  validez_dias: IN,
  garantia: TN,
  condiciones: TN,
  archivo_url: TN,
} as const;

interface FurExistente {
  id: number;
  numero: string;
  id_fase: number | null;
  id_cotizacion: number | null;
}

interface DocExistente {
  id: number;
  id_requerimiento: number;
  clase: string;
  estado: string;
  numero_documento: string;
  fecha_emision: string | null;
}

interface LineaExistente {
  id: number;
  id_requerimiento: number;
  id_ppto_item: number | null;
  id_producto: number;
  id_subfase: number | null;
  cantidad: string;
  precio_referencial: string | null;
  precio: string | null;
  plazo: number | null;
  marca: string | null;
  obs: string | null;
}

/**
 * Conciliación de compromisos del presupuesto Meta (plan 09, §3.5): deja los FUR de adjudicación (uno por fase y proveedor
 * ganador) y sus órdenes de compra y de servicio **al día con los ítems adjudicados**. Corre al final de cada grabación,
 * dentro de la transacción de quien llama y con el presupuesto bloqueado, y es idempotente: sin cambios no escribe nada.
 *
 *  - Presupuesto sin aprobar: las órdenes nacen y se mantienen `PROVISIONAL` (se ven e imprimen; no se pagan ni se reciben).
 *  - Presupuesto aprobado (reasignación de un ítem cuya orden se anuló, D-12): la orden nace `REGISTRADO`.
 *  - Una orden `REGISTRADO` o un FUR sin orden vigente no se tocan: sus ítems se consideran pedidos.
 */
@Injectable()
export class ConciliarCompromisosService {
  constructor(
    private readonly sql: AlmacenSql,
    private readonly ledger: InventarioLedger,
  ) {}

  async conciliar(tx: Tx, ppto: PresupuestoBloqueado, user?: AuthUser): Promise<ResultadoConciliacion> {
    const editable = ESTADOS_EDITABLES.includes(ppto.estado as EstadoPpto);
    if (!editable && ppto.estado !== 'APROBADO') return { creados: [], actualizados: [], anulados: [], sin_cambio: 0 };
    const estadoDoc: Ctx['estadoDoc'] = editable ? 'PROVISIONAL' : 'REGISTRADO';
    const q = sqlTag(this.sql);

    // 1) FUR de adjudicación vigentes y qué ítems están ya pedidos por cualquier FUR vigente.
    const furs = await q.rows<FurExistente>({ id: I, numero: T, id_fase: IN, id_cotizacion: IN }, tx)`
      SELECT id, numero::text AS numero, id_fase, id_cotizacion_ganadora AS id_cotizacion
        FROM requerimiento
       WHERE id_ppto_principal = ${ppto.id}::int AND origen::text = 'PPTO_ADJUDICACION' AND estado::text NOT IN ('ANULADO', 'RECHAZADO')
       ORDER BY id FOR UPDATE`;
    const idsFur = furs.map((f) => f.id);
    const docs = idsFur.length
      ? await q.rows<DocExistente>({ id: I, id_requerimiento: I, clase: T, estado: T, numero_documento: T, fecha_emision: TN }, tx)`
          SELECT id, id_requerimiento, COALESCE(clase_documento::text, '') AS clase, estado::text AS estado,
                 COALESCE(numero_documento, '')::text AS numero_documento, fecha_emision::date::text AS fecha_emision
            FROM "documentosOrigen"
           WHERE id_requerimiento = ANY(string_to_array(${csv(idsFur)}::text, ',')::int[]) AND estado::text <> 'ANULADO' ORDER BY id`
      : [];
    const docsDe = (idFur: number) => docs.filter((d) => d.id_requerimiento === idFur);
    // Conciliable = FUR con al menos una orden vigente y todas provisionales.
    const conciliables = furs.filter((f) => {
      const d = docsDe(f.id);
      return d.length > 0 && d.every((x) => x.estado === 'PROVISIONAL');
    });
    const idsConciliables = new Set(conciliables.map((f) => f.id));

    const pedidos = await q.rows<{ id_ppto_item: number; id_requerimiento: number; id_detalle_fase: number }>(
      { id_ppto_item: I, id_requerimiento: I, id_detalle_fase: I },
      tx,
    )`
      SELECT rd.id_ppto_item, rd.id_requerimiento, f.id AS id_detalle_fase
        FROM requerimiento_detalle rd
        JOIN requerimiento r ON r.id = rd.id_requerimiento AND r.estado::text NOT IN ('ANULADO', 'RECHAZADO')
        JOIN "ppto_DetalleItems" i ON i.id = rd.id_ppto_item
        JOIN "ppto_DetalleFasesCate" c ON c.id = i.id_detalle_categoria
        JOIN "ppto_DetalleFases" f ON f."IdPresupuestoDetalle" = c."IdPresupuestoDetalle"
       WHERE i."IdPresupuesto" = ${ppto.codigo}::text AND f."IdPresupuesto" = ${ppto.codigo}::text`;
    const bloqueados = new Set(pedidos.filter((p) => !idsConciliables.has(p.id_requerimiento)).map((p) => p.id_ppto_item));
    const faseDeItem = new Map(pedidos.map((p) => [p.id_ppto_item, p.id_detalle_fase]));

    // 2) Lo que debería existir: ítems adjudicados con cantidad, que ningún otro FUR ya pide.
    const filasTodas = (
      await q.rows<FilaDeseada>(DESEADA_SPEC, tx)`
      SELECT i.id AS id_item, f.id AS id_detalle_fase, m.id AS id_fase_maestra,
             COALESCE(m."FaseProyecto", f."IdpptoFase", 'Fase #' || f.id::text)::text AS fase, c.id AS id_subfase,
             i.id_producto, p.codigo::text AS codigo, p.tipo_producto::text AS tipo_producto, p.id_categoria,
             i."Cantidad"::text AS cantidad, COALESCE(i."CostoUnitarioMeta", i."CostoUnitario")::text AS costo_unitario, g.precio_unitario::text AS precio,
             g.plazo_entrega_dias AS g_plazo, g.marca_modelo::text AS g_marca, g.observaciones AS g_obs,
             q.id AS id_cotizacion, q.id_proveedor, COALESCE(a."NombreComercial", a."Anexo")::text AS proveedor,
             q.fecha::text AS fecha, q.referencia::text AS referencia, q.moneda_id::text AS moneda_id, q.moneda_simbolo::text AS moneda_simbolo,
             q.incluye_igv, q.afecto_igv, q.forma_pago::text AS forma_pago, q.dias_credito,
             q.adelanto_porcentaje::text AS adelanto_porcentaje, q.medio_pago::text AS medio_pago, q.plazo_entrega_dias, q.validez_dias,
             q.garantia::text AS garantia, q.condiciones, q.archivo_url::text AS archivo_url
        FROM "ppto_DetalleItems" i
        JOIN "ppto_DetalleFasesCate" c ON c.id = i.id_detalle_categoria
        JOIN "ppto_DetalleFases" f ON f."IdPresupuestoDetalle" = c."IdPresupuestoDetalle"
        LEFT JOIN "ppto_Fases" m ON m."IdpptoFase" = f."IdpptoFase"
        JOIN producto p ON p.id = i.id_producto
        JOIN ppto_cotizacion_detalle g ON g.id = i.id_ppto_cot_detalle_ganadora
        JOIN ppto_cotizacion q ON q.id = g.id_cotizacion
        JOIN anexos a ON a.id = q.id_proveedor
       WHERE i."IdPresupuesto" = ${ppto.codigo}::text AND f."IdPresupuesto" = ${ppto.codigo}::text AND i."Cantidad" > 0
       ORDER BY f.id, q.id, c.id, i."Orden", i.id`
    ).filter((f) => !bloqueados.has(f.id_item));
    // Versiones (plan 09, §3.7): lo que las versiones anteriores ya pidieron con órdenes registradas no se vuelve a pedir; si el ítem
    // creció, se pide solo la diferencia; si cambió de proveedor es un conflicto (no se genera nada y bloquea la aprobación).
    const cobertura = await coberturaPorOrigen(this.sql, ppto.codigo, tx);
    const filas = filasTodas.flatMap((f) => {
      const r = resolverCobertura(Number(f.cantidad), f.id_proveedor, cobertura.get(f.id_item));
      if (r.tipo === 'LIBRE') return [f];
      if (r.tipo === 'DIFERENCIA') return [{ ...f, cantidad: r.cantidad.toFixed(4) }];
      return [];
    });

    const cabeceras = new Map<number, CabeceraCotizacion>();
    const deseados: ItemDeseado[] = filas.map((f) => {
      if (!cabeceras.has(f.id_cotizacion)) cabeceras.set(f.id_cotizacion, cabeceraDe(f));
      return {
        idItem: f.id_item,
        idDetalleFase: f.id_detalle_fase,
        idFaseMaestra: f.id_fase_maestra,
        idProveedor: f.id_proveedor,
        idCotizacion: f.id_cotizacion,
        idSubfase: f.id_subfase,
        idProducto: f.id_producto,
        tipoProducto: (f.tipo_producto === 'SERVICIO' ? 'SERVICIO' : 'PRODUCTO') as TipoProducto,
        cantidad: f.cantidad,
        precioMeta: f.costo_unitario,
        precioCotizado: f.precio,
        plazoEntregaDias: f.g_plazo,
        marcaModelo: f.g_marca,
        observaciones: f.g_obs,
      };
    });
    const infoFila = new Map(filas.map((f) => [f.id_item, f]));
    const grupos = agruparDeseados(deseados, (idCot, lineas) => firmaGrupo(cabeceras.get(idCot)!, lineas.map(aLineaFirma)));

    // 3) Lo que ya existe, con la misma huella.
    const lineasEx = conciliables.length
      ? await q.rows<LineaExistente>(
          { id: I, id_requerimiento: I, id_ppto_item: IN, id_producto: I, id_subfase: IN, cantidad: T, precio_referencial: TN, precio: TN, plazo: IN, marca: TN, obs: TN },
          tx,
        )`
          SELECT rd.id, rd.id_requerimiento, rd.id_ppto_item, rd.id_producto, rd.id_ppto_detalle_categoria AS id_subfase,
                 COALESCE(rd.cantidad_aprobada, rd.cantidad)::text AS cantidad, rd.precio_referencial::text AS precio_referencial,
                 cd.precio_unitario::text AS precio, cd.plazo_entrega_dias AS plazo, cd.marca_modelo::text AS marca, cd.observaciones AS obs
            FROM requerimiento_detalle rd
            JOIN requerimiento r ON r.id = rd.id_requerimiento
            LEFT JOIN cotizacion_detalle cd ON cd.id_requerimiento_detalle = rd.id AND cd.id_cotizacion = r.id_cotizacion_ganadora
           WHERE rd.id_requerimiento = ANY(string_to_array(${csv(conciliables.map((f) => f.id))}::text, ',')::int[]) ORDER BY rd.id`
      : [];
    const cabCopias = await this.cabecerasDeCopias(tx, conciliables.map((f) => f.id_cotizacion).filter((c): c is number => c !== null));

    const existentes: GrupoExistente[] = [];
    const infoExistente = new Map<number, { fur: FurExistente; clave: string }>();
    for (const fur of conciliables) {
      const cab = fur.id_cotizacion === null ? undefined : cabCopias.get(fur.id_cotizacion);
      const lineas = lineasEx.filter((l) => l.id_requerimiento === fur.id);
      const primeraFase = lineas.map((l) => (l.id_ppto_item === null ? undefined : faseDeItem.get(l.id_ppto_item))).find((x) => x !== undefined) ?? 0;
      const clave = claveGrupo(fur.id_fase, cab?.idProveedor ?? 0, primeraFase);
      const firma = cab
        ? firmaGrupo(
            cab,
            lineas.map((l) => ({
              idItem: l.id_ppto_item ?? 0,
              idProducto: l.id_producto,
              idSubfase: l.id_subfase ?? 0,
              cantidad: l.cantidad,
              precioMeta: l.precio_referencial ?? '0',
              precioCotizado: l.precio ?? '0',
              plazoEntregaDias: l.plazo,
              marcaModelo: l.marca,
              observaciones: l.obs,
            })),
          )
        : `sin-cotizacion-${fur.id}`;
      existentes.push({ clave, idRequerimiento: fur.id, firma });
      infoExistente.set(fur.id, { fur, clave });
    }

    const plan = planConciliacion(grupos, existentes);
    const resultado: ResultadoConciliacion = { creados: [], actualizados: [], anulados: [], sin_cambio: plan.sinCambio };
    if (plan.crear.length + plan.actualizar.length + plan.anular.length === 0) return resultado;

    if (plan.crear.length > 0 && ppto.id_centro_costo === null) {
      throw new BadRequestException('El presupuesto debe estar vinculado a un centro de costo para adjudicar compras');
    }
    const hoy = hoyLima();
    // El trabajador que firma solo se exige cuando hay que crear un FUR nuevo.
    let idTrabajador: number | null = null;
    const trabajador = async (): Promise<number> => {
      if (idTrabajador === null) {
        idTrabajador = user ? await trabajadorDelUsuario(tx.orm.public, user.id, user.usuario) : exigirTrabajadorVinculado(null, '(sin sesión)');
      }
      return idTrabajador;
    };
    const ctx = { tx, ppto, estadoDoc, hoy, infoFila, cabeceras, trabajador };

    for (const e of plan.anular) {
      const f = infoExistente.get(e.idRequerimiento)!.fur;
      await this.anularFur(tx, ppto, f, docsDe(f.id));
      resultado.anulados.push({ id_requerimiento: f.id, numero: f.numero });
    }
    for (const a of plan.actualizar) {
      const f = infoExistente.get(a.existente.idRequerimiento)!.fur;
      resultado.actualizados.push(await this.actualizarFur(ctx, f, docsDe(f.id), a.deseado));
    }
    for (const g of plan.crear) resultado.creados.push(await this.crearFur(ctx, g));
    return resultado;
  }

  /**
   * Anula el FUR y las órdenes **provisionales** de un presupuesto que se reemplaza por una nueva versión (al aprobar la versión).
   * Las órdenes registradas se conservan: son compromisos con terceros y las cubre la cadena de versiones.
   */
  async anularProvisionales(tx: Tx, ppto: PresupuestoBloqueado, motivo: string): Promise<number> {
    const q = sqlTag(this.sql);
    const furs = await q.rows<FurExistente>({ id: I, numero: T, id_fase: IN, id_cotizacion: IN }, tx)`
      SELECT id, numero::text AS numero, id_fase, id_cotizacion_ganadora AS id_cotizacion
        FROM requerimiento
       WHERE id_ppto_principal = ${ppto.id}::int AND origen::text = 'PPTO_ADJUDICACION' AND estado::text NOT IN ('ANULADO', 'RECHAZADO')
       ORDER BY id FOR UPDATE`;
    let anulados = 0;
    for (const f of furs) {
      const docs = await q.rows<DocExistente>({ id: I, id_requerimiento: I, clase: T, estado: T, numero_documento: T, fecha_emision: TN }, tx)`
        SELECT id, id_requerimiento, COALESCE(clase_documento::text, '') AS clase, estado::text AS estado,
               COALESCE(numero_documento, '')::text AS numero_documento, fecha_emision::date::text AS fecha_emision
          FROM "documentosOrigen" WHERE id_requerimiento = ${f.id}::int AND estado::text <> 'ANULADO'`;
      if (docs.length === 0 || docs.some((d) => d.estado !== 'PROVISIONAL')) continue;
      await this.anularFur(tx, ppto, f, docs, motivo);
      anulados += 1;
    }
    return anulados;
  }

  /** Cierra las órdenes provisionales del presupuesto (al aprobarlo): pasan a `REGISTRADO` y entran a programación y pago. */
  async cerrar(tx: Tx, ppto: PresupuestoBloqueado): Promise<number> {
    const q = sqlTag(this.sql);
    const hoy = hoyLima();
    const { periodo, mes } = periodoYMes(hoy);
    // La fecha de emisión pasa a hoy solo si nadie la completó a mano (sigue siendo la del día en que se generó).
    return q.run(tx)`
      UPDATE "documentosOrigen"
         SET estado = 'REGISTRADO',
             fecha_emision = CASE WHEN fecha_emision::date = fecha_creacion::date THEN ${hoy}::date::timestamptz ELSE fecha_emision END,
             periodo = CASE WHEN fecha_emision::date = fecha_creacion::date THEN ${periodo}::text ELSE periodo END,
             mes = CASE WHEN fecha_emision::date = fecha_creacion::date THEN ${mes}::text ELSE mes END
       WHERE estado::text = 'PROVISIONAL'
         AND id_requerimiento IN (SELECT id FROM requerimiento
                                   WHERE id_ppto_principal = ${ppto.id}::int AND origen::text = 'PPTO_ADJUDICACION' AND estado::text NOT IN ('ANULADO', 'RECHAZADO'))`;
  }

  // ------------------------------------------------------------- crear

  private async crearFur(ctx: Ctx, g: GrupoDeseado): Promise<CompromisoGenerado> {
    const { tx, ppto, hoy } = ctx;
    const q = sqlTag(this.sql);
    const trab = await ctx.trabajador();
    const cab = ctx.cabeceras.get(g.idCotizacion)!;
    const fase = ctx.infoFila.get(g.items[0].idItem)!.fase;
    const numero = await this.ledger.siguienteNumero(tx, 'FUR');
    const justificacion = `[${ppto.codigo}] Compra adjudicada · Fase: ${fase} · Proveedor: ${cab.proveedor ?? cab.idProveedor}`;
    const [fur] = await q.rows<{ id: number }>({ id: I }, tx)`
      INSERT INTO requerimiento (numero, fecha, id_centro_costo, id_fase, id_solicitante, justificacion, estado, id_aprobador, fecha_aprobacion,
                                 tipo, comentario_adjudicacion, id_ppto_principal, origen)
      VALUES (${numero}::text, ${hoy}::date, ${ppto.id_centro_costo ?? 0}::int, NULLIF(${g.idFaseMaestra ?? 0}::int, 0), ${trab}::int,
              ${justificacion}::text, 'APROBADO', ${trab}::int, now(), 'COMPRA', ${`Adjudicado desde el presupuesto ${ppto.codigo}`}::text,
              ${ppto.id}::int, 'PPTO_ADJUDICACION')
      RETURNING id`;
    const idFur = fur.id;
    const comentario = `Generado desde el presupuesto ${ppto.codigo}`;
    await registrarEvento(this.sql, tx, idFur, 'CREAR', null, 'BORRADOR', trab, comentario);
    await registrarEvento(this.sql, tx, idFur, 'APROBAR', 'BORRADOR', 'APROBADO', trab, comentario);

    const idCopia = await this.copiarCotizacion(tx, idFur, cab);
    const lineaPorItem = await this.insertarLineas(tx, idFur, idCopia, g.items);
    await q.run(tx)`UPDATE requerimiento SET id_cotizacion_ganadora = ${idCopia}::int WHERE id = ${idFur}::int`;
    const documentos = await this.crearDocumentos(ctx, { id: idFur, numero, id_fase: g.idFaseMaestra }, cab, g.items, lineaPorItem, idCopia);
    return { id_requerimiento: idFur, numero, fase, id_proveedor: g.idProveedor, proveedor: cab.proveedor, documentos };
  }

  /** Copia la cotización ganadora al FUR (`cotizacion`): es el sustento que ya conocen tesorería, la impresión y la orden. */
  private async copiarCotizacion(tx: Tx, idFur: number, c: CabeceraCotizacion): Promise<number> {
    const q = sqlTag(this.sql);
    const numero = await this.ledger.siguienteNumero(tx, 'COT');
    const [cot] = await q.rows<{ id: number }>({ id: I }, tx)`
      INSERT INTO cotizacion (numero, id_requerimiento, id_proveedor, fecha, referencia, moneda_id, moneda_simbolo, incluye_igv, afecto_igv,
                              forma_pago, dias_credito, adelanto_porcentaje, medio_pago, plazo_entrega_dias, validez_dias, garantia,
                              condiciones, archivo_url)
      VALUES (${numero}::text, ${idFur}::int, ${c.idProveedor}::int, ${c.fecha}::date, NULLIF(${c.referencia ?? ''}::text, ''),
              ${c.monedaId}::text, NULLIF(${c.monedaSimbolo ?? ''}::text, ''), ${c.incluyeIgv}::boolean, ${c.afectoIgv}::boolean,
              ${c.formaPago}::text, ${c.diasCredito}::int,
              CASE WHEN ${c.adelantoPorcentaje !== null}::boolean THEN ${c.adelantoPorcentaje ?? '0'}::numeric END,
              NULLIF(${c.medioPago ?? ''}::text, ''), CASE WHEN ${c.plazoEntregaDias !== null}::boolean THEN ${c.plazoEntregaDias ?? 0}::int END,
              CASE WHEN ${c.validezDias !== null}::boolean THEN ${c.validezDias ?? 0}::int END, NULLIF(${c.garantia ?? ''}::text, ''),
              NULLIF(${c.condiciones ?? ''}::text, ''), NULLIF(${c.archivoUrl ?? ''}::text, ''))
      RETURNING id`;
    return cot.id;
  }

  /** Líneas del FUR y de su cotización copiada, una por ítem. Devuelve ítem -> línea del FUR. */
  private async insertarLineas(tx: Tx, idFur: number, idCopia: number, items: readonly ItemDeseado[]): Promise<Map<number, number>> {
    const q = sqlTag(this.sql);
    const lineaPorItem = new Map<number, number>();
    for (const it of items) {
      const [rd] = await q.rows<{ id: number }>({ id: I }, tx)`
        INSERT INTO requerimiento_detalle (id_requerimiento, id_producto, cantidad, cantidad_aprobada, precio_referencial,
                                           id_ppto_detalle_categoria, id_ppto_item)
        VALUES (${idFur}::int, ${it.idProducto}::int, ${it.cantidad}::numeric, ${it.cantidad}::numeric, ${it.precioMeta}::numeric,
                ${it.idSubfase}::int, ${it.idItem}::int)
        RETURNING id`;
      lineaPorItem.set(it.idItem, rd.id);
      await q.run(tx)`
        INSERT INTO cotizacion_detalle (id_cotizacion, id_requerimiento_detalle, cotiza, cantidad, precio_unitario, plazo_entrega_dias,
                                        marca_modelo, observaciones)
        VALUES (${idCopia}::int, ${rd.id}::int, true, ${it.cantidad}::numeric, ${it.precioCotizado}::numeric,
                CASE WHEN ${it.plazoEntregaDias !== null}::boolean THEN ${it.plazoEntregaDias ?? 0}::int END,
                NULLIF(${it.marcaModelo ?? ''}::text, ''), NULLIF(${it.observaciones ?? ''}::text, ''))`;
    }
    return lineaPorItem;
  }

  /** Líneas de orden por clase (bienes/servicios), con el precio **sin IGV** de la oferta ganadora, como al aprobar un FUR. */
  private lineasDeOrden(items: readonly ItemDeseado[], cab: CabeceraCotizacion, lineaPorItem: Map<number, number>, ctx: Ctx) {
    const porClase = new Map<ClaseOrden, { lineas: Array<{ idProducto: number; codigo: string; tipoProducto: string; cantidad: string; precio: string; idRequerimientoDetalle: number | null }>; idCategoria: number; monto: number }>();
    for (const it of items) {
      const clase = claseDe(it.tipoProducto);
      const info = ctx.infoFila.get(it.idItem)!;
      const precio = preciosOferta(Number(it.precioCotizado), cab.incluyeIgv, cab.afectoIgv).sin.toFixed(4);
      const g = porClase.get(clase) ?? { lineas: [], idCategoria: info.id_categoria, monto: 0 };
      g.lineas.push({ idProducto: it.idProducto, codigo: info.codigo, tipoProducto: it.tipoProducto, cantidad: it.cantidad, precio, idRequerimientoDetalle: lineaPorItem.get(it.idItem) ?? null });
      g.monto += Number(it.cantidad) * Number(precio);
      porClase.set(clase, g);
    }
    return porClase;
  }

  private async crearDocumentos(
    ctx: Ctx,
    fur: { id: number; numero: string; id_fase: number | null },
    cab: CabeceraCotizacion,
    items: readonly ItemDeseado[],
    lineaPorItem: Map<number, number>,
    idCopia: number,
  ): Promise<DocumentoCompromiso[]> {
    const generados: DocumentoCompromiso[] = [];
    for (const [clase, g] of this.lineasDeOrden(items, cab, lineaPorItem, ctx)) {
      generados.push(...(await this.crearDocumentosDeClase(ctx, fur, cab, clase, g, idCopia)));
    }
    return generados;
  }

  // ------------------------------------------------------------- actualizar

  private async actualizarFur(ctx: Ctx, fur: FurExistente, docs: DocExistente[], g: GrupoDeseado): Promise<CompromisoGenerado> {
    const { tx, ppto } = ctx;
    const q = sqlTag(this.sql);
    const cab = ctx.cabeceras.get(g.idCotizacion)!;
    const fase = ctx.infoFila.get(g.items[0].idItem)!.fase;
    // Un FUR sin cotización copiada (datos incompletos) la recibe ahora.
    const idCopia = fur.id_cotizacion ?? (await this.copiarCotizacion(tx, fur.id, cab));
    if (fur.id_cotizacion === null) await q.run(tx)`UPDATE requerimiento SET id_cotizacion_ganadora = ${idCopia}::int WHERE id = ${fur.id}::int`;

    // Se rehacen las líneas conservando el FUR, la cotización copiada y las órdenes (mismos ids y números).
    await q.run(tx)`DELETE FROM cotizacion_detalle WHERE id_cotizacion = ${idCopia}::int`;
    await q.run(tx)`
      DELETE FROM "ordenCompraDetalle" WHERE id_orden_compra = ANY(string_to_array(${csv(docs.map((d) => d.id))}::text, ',')::int[])`;
    await q.run(tx)`DELETE FROM requerimiento_detalle WHERE id_requerimiento = ${fur.id}::int`;
    await q.run(tx)`
      UPDATE cotizacion
         SET fecha = ${cab.fecha}::date, referencia = NULLIF(${cab.referencia ?? ''}::text, ''), moneda_id = ${cab.monedaId}::text,
             moneda_simbolo = NULLIF(${cab.monedaSimbolo ?? ''}::text, ''), incluye_igv = ${cab.incluyeIgv}::boolean, afecto_igv = ${cab.afectoIgv}::boolean,
             forma_pago = ${cab.formaPago}::text, dias_credito = ${cab.diasCredito}::int,
             adelanto_porcentaje = CASE WHEN ${cab.adelantoPorcentaje !== null}::boolean THEN ${cab.adelantoPorcentaje ?? '0'}::numeric END,
             medio_pago = NULLIF(${cab.medioPago ?? ''}::text, ''),
             plazo_entrega_dias = CASE WHEN ${cab.plazoEntregaDias !== null}::boolean THEN ${cab.plazoEntregaDias ?? 0}::int END,
             validez_dias = CASE WHEN ${cab.validezDias !== null}::boolean THEN ${cab.validezDias ?? 0}::int END,
             garantia = NULLIF(${cab.garantia ?? ''}::text, ''), condiciones = NULLIF(${cab.condiciones ?? ''}::text, ''),
             archivo_url = NULLIF(${cab.archivoUrl ?? ''}::text, '')
       WHERE id = ${idCopia}::int`;
    const lineaPorItem = await this.insertarLineas(tx, fur.id, idCopia, g.items);

    // Órdenes: se reutiliza la de cada clase que sigue haciendo falta, se anula la que ya no y se crea la que falta.
    const documentos: DocumentoCompromiso[] = [];
    const porClase = this.lineasDeOrden(g.items, cab, lineaPorItem, ctx);
    for (const [clase, datos] of porClase) {
      const existente = docs.find((d) => d.clase === clase);
      if (!existente) {
        documentos.push(...(await this.crearDocumentosDeClase(ctx, { id: fur.id, numero: fur.numero, id_fase: g.idFaseMaestra }, cab, clase, datos, idCopia)));
        continue;
      }
      const m = await calcularMontosDocumento(this.sql, tx, {
        clase,
        monto: datos.monto,
        afectoIgv: cab.afectoIgv,
        idAnexo: cab.idProveedor,
        monedaId: cab.monedaId,
        monedaSimbolo: cab.monedaSimbolo,
        fechaEmision: existente.fecha_emision ?? ctx.hoy,
      });
      const t = m.trib;
      await q.run(tx)`
        UPDATE "documentosOrigen"
           SET forma_pago = NULLIF(${cab.formaPago}::text, ''), moneda_id = NULLIF(${cab.monedaId}::text, ''), moneda_simbolo = NULLIF(${cab.monedaSimbolo ?? ''}::text, ''),
               monto = ${String(m.monto)}::numeric, igv = ${String(m.igv)}::numeric, total = ${String(m.total)}::numeric,
               afecto_igv = ${cab.afectoIgv}::boolean, dias_credito = ${cab.diasCredito}::int, id_categoria = NULLIF(${datos.idCategoria}::int, 0),
               id_cotizacion = ${idCopia}::int,
               detraccion_porcentaje = CASE WHEN ${t.detraccion_porcentaje !== null}::boolean THEN ${String(t.detraccion_porcentaje ?? 0)}::numeric END,
               detraccion_monto = CASE WHEN ${t.detraccion_monto !== null}::boolean THEN ${String(t.detraccion_monto ?? 0)}::numeric END,
               retencion_porcentaje = CASE WHEN ${t.retencion_porcentaje !== null}::boolean THEN ${String(t.retencion_porcentaje ?? 0)}::numeric END,
               retencion_monto = CASE WHEN ${t.retencion_monto !== null}::boolean THEN ${String(t.retencion_monto ?? 0)}::numeric END,
               retencion_manual = ${t.retencion_manual}::boolean
         WHERE id = ${existente.id}::int`;
      await insertarLineasDocumento(this.sql, tx, existente.id, datos.lineas);
      documentos.push({ id: existente.id, numero_documento: existente.numero_documento, clase });
    }
    for (const d of docs.filter((x) => !porClase.has(x.clase as ClaseOrden))) {
      await this.anularDocumento(tx, d.id, `Readjudicado en ${ppto.codigo}`);
    }
    return { id_requerimiento: fur.id, numero: fur.numero, fase, id_proveedor: g.idProveedor, proveedor: cab.proveedor, documentos };
  }

  private async crearDocumentosDeClase(
    ctx: Ctx,
    fur: { id: number; numero: string; id_fase: number | null },
    cab: CabeceraCotizacion,
    clase: ClaseOrden,
    g: { lineas: Array<{ idProducto: number; codigo: string; tipoProducto: string; cantidad: string; precio: string; idRequerimientoDetalle: number | null }>; idCategoria: number; monto: number },
    idCopia: number,
  ): Promise<DocumentoCompromiso[]> {
    const doc = await insertarDocumentoOrigen(this.sql, this.ledger, ctx.tx, {
      clase,
      tipoOc: clase === 'ORDEN_SERVICIO' ? 'SERVICIO' : 'PRODUCTO',
      idCentroCosto: ctx.ppto.id_centro_costo,
      idFase: fur.id_fase,
      idArea: null,
      idAnexo: cab.idProveedor,
      idCategoria: g.idCategoria,
      fechaEmision: ctx.hoy,
      formaPago: cab.formaPago,
      monedaId: cab.monedaId,
      monedaSimbolo: cab.monedaSimbolo,
      monto: g.monto,
      afectoIgv: cab.afectoIgv,
      diasCredito: cab.diasCredito,
      fechaVencimiento: null,
      comentarios: `Generado desde ${fur.numero} (presupuesto ${ctx.ppto.codigo})`,
      idRequerimiento: fur.id,
      idCotizacion: idCopia,
      estado: ctx.estadoDoc,
      lineas: g.lineas,
    });
    return [{ ...doc, clase }];
  }

  // ------------------------------------------------------------- anular

  private async anularFur(tx: Tx, ppto: PresupuestoBloqueado, fur: FurExistente, docs: DocExistente[], motivo?: string): Promise<void> {
    const q = sqlTag(this.sql);
    await q.run(tx)`UPDATE requerimiento SET estado = 'ANULADO' WHERE id = ${fur.id}::int`;
    await registrarEvento(this.sql, tx, fur.id, 'ANULAR', 'APROBADO', 'ANULADO', null, motivo ?? `Readjudicado en el presupuesto ${ppto.codigo}`);
    for (const d of docs) await this.anularDocumento(tx, d.id, motivo ?? `Readjudicado en ${ppto.codigo}`);
  }

  private async anularDocumento(tx: Tx, idDocumento: number, motivo: string): Promise<void> {
    const q = sqlTag(this.sql);
    await q.run(tx)`
      UPDATE "documentosOrigen" SET estado = 'ANULADO', comentarios = COALESCE(comentarios || E'\n', '') || ${`ANULADO: ${motivo}`}::text
       WHERE id = ${idDocumento}::int`;
  }

  // ------------------------------------------------------------- lectura

  /** Cabeceras de las cotizaciones copiadas a los FUR, con la forma de la huella. */
  private async cabecerasDeCopias(tx: Tx, ids: number[]): Promise<Map<number, CabeceraCotizacion>> {
    const resultado = new Map<number, CabeceraCotizacion>();
    if (ids.length === 0) return resultado;
    const q = sqlTag(this.sql);
    const filas = await q.rows<Omit<FilaDeseada, 'id_item' | 'id_detalle_fase' | 'id_fase_maestra' | 'fase' | 'id_subfase' | 'id_producto' | 'codigo' | 'tipo_producto' | 'id_categoria' | 'cantidad' | 'costo_unitario' | 'precio' | 'g_plazo' | 'g_marca' | 'g_obs'>>(
      {
        id_cotizacion: I,
        id_proveedor: I,
        proveedor: TN,
        fecha: T,
        referencia: TN,
        moneda_id: T,
        moneda_simbolo: TN,
        incluye_igv: B,
        afecto_igv: B,
        forma_pago: T,
        dias_credito: I,
        adelanto_porcentaje: TN,
        medio_pago: TN,
        plazo_entrega_dias: IN,
        validez_dias: IN,
        garantia: TN,
        condiciones: TN,
        archivo_url: TN,
      },
      tx,
    )`
      SELECT q.id AS id_cotizacion, q.id_proveedor, NULL::text AS proveedor, q.fecha::text AS fecha, q.referencia::text AS referencia,
             q.moneda_id::text AS moneda_id, q.moneda_simbolo::text AS moneda_simbolo, q.incluye_igv, q.afecto_igv, q.forma_pago::text AS forma_pago,
             q.dias_credito, q.adelanto_porcentaje::text AS adelanto_porcentaje, q.medio_pago::text AS medio_pago, q.plazo_entrega_dias,
             q.validez_dias, q.garantia::text AS garantia, q.condiciones, q.archivo_url::text AS archivo_url
        FROM cotizacion q WHERE q.id = ANY(string_to_array(${csv(ids)}::text, ',')::int[])`;
    for (const f of filas) resultado.set(f.id_cotizacion, cabeceraDe(f));
    return resultado;
  }
}

interface Ctx {
  tx: Tx;
  ppto: PresupuestoBloqueado;
  estadoDoc: 'PROVISIONAL' | 'REGISTRADO';
  hoy: string;
  infoFila: Map<number, FilaDeseada>;
  cabeceras: Map<number, CabeceraCotizacion>;
  trabajador: () => Promise<number>;
}

type FilaCabecera = Pick<
  FilaDeseada,
  | 'id_cotizacion'
  | 'id_proveedor'
  | 'proveedor'
  | 'fecha'
  | 'referencia'
  | 'moneda_id'
  | 'moneda_simbolo'
  | 'incluye_igv'
  | 'afecto_igv'
  | 'forma_pago'
  | 'dias_credito'
  | 'adelanto_porcentaje'
  | 'medio_pago'
  | 'plazo_entrega_dias'
  | 'validez_dias'
  | 'garantia'
  | 'condiciones'
  | 'archivo_url'
>;

function cabeceraDe(f: FilaCabecera): CabeceraCotizacion {
  return {
    idCotizacion: f.id_cotizacion,
    proveedor: f.proveedor,
    idProveedor: f.id_proveedor,
    fecha: f.fecha,
    referencia: f.referencia,
    monedaId: f.moneda_id,
    monedaSimbolo: f.moneda_simbolo,
    incluyeIgv: f.incluye_igv,
    afectoIgv: f.afecto_igv,
    formaPago: f.forma_pago,
    diasCredito: f.dias_credito,
    adelantoPorcentaje: f.adelanto_porcentaje,
    medioPago: f.medio_pago,
    plazoEntregaDias: f.plazo_entrega_dias,
    validezDias: f.validez_dias,
    garantia: f.garantia,
    condiciones: f.condiciones,
    archivoUrl: f.archivo_url,
  };
}

function aLineaFirma(i: ItemDeseado): LineaFirma {
  return {
    idItem: i.idItem,
    idProducto: i.idProducto,
    idSubfase: i.idSubfase,
    cantidad: i.cantidad,
    precioMeta: i.precioMeta,
    precioCotizado: i.precioCotizado,
    plazoEntregaDias: i.plazoEntregaDias,
    marcaModelo: i.marcaModelo,
    observaciones: i.observaciones,
  };
}

