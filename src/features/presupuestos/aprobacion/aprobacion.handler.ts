import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { throwIfUniqueViolation } from '../../../platform/db/pg-errors.js';
import { nowInstant } from '../../../platform/db/temporal.js';
import { toDecimalString, toVarchar } from '../../../platform/db/varchar-helpers.js';
import type { AuthUser } from '../../../platform/auth/jwt/auth-user.js';
import { InventarioLedger } from '../../almacen/shared/inventario-ledger.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { AlmacenSql, B, I, T, TN, sqlTag } from '../../almacen/shared/almacen-sql.js';
import { csv } from '../../almacen/shared/oc-saldos.js';
import { preciosOferta, totalesCotizacion } from '../../requerimientos/shared/precios-oferta.js';
import { claveMoneda, tcVigente } from '../../tesoreria/shared/tipo-cambio.js';
import { esSoles } from '../../tesoreria/shared/tributos.js';
import { subpartidasConAvance } from '../../operaciones-obra/partidas/partidas.handler.js';
import { capturarEstructura } from '../../operaciones-obra/shared/capturar-estructura.js';
import { registrarEvento } from '../../operaciones-obra/shared/control-avance/registrar-evento.js';
import { hoyLima, readDateOnly } from '../../operaciones-obra/shared/obra-shared.js';
import { calculateAmounts } from '../presupuesto-principal/presupuesto-principal.handler.js';
import type {
  AprobarPresupuestoResponseDto,
  BloqueoAprobacionDto,
  ComercialResponseDto,
  EstructuraCapturadaDto,
  LimpiarVaciosResponseDto,
  NuevaVersionResponseDto,
  ValidacionPresupuestoResponseDto,
} from './aprobacion.dto.js';
import { armarComercial, type ItemComercialEntrada, type FaseMeta, type OfertaGanadora } from './comercial.js';
import { conflictosPorOrigen } from '../compromisos/cobertura-origen.js';
import { ConciliarCompromisosService } from '../compromisos/conciliar-compromisos.service.js';
import { bloquearPresupuesto, itemsSinAdjudicar } from '../cotizaciones-ppto/contexto-ppto.js';
import { ESTADOS_EDITABLES, esAdicional, esAprobado, textoLegado, type EstadoPpto } from './estados.js';
import { sincronizarPresupuestoCc } from './sincronizar-cc.js';
import {
  itemVacio,
  planificarLimpieza,
  validarPresupuesto,
  type FasePresupuesto,
} from './validar-presupuesto.js';

type Orm = Database['orm']['public'];
type Ppto = NonNullable<Awaited<ReturnType<Orm['ppto_Principal']['first']>>>;

interface Evaluacion {
  tipo: 'Principal' | 'Adicional';
  bloqueos: BloqueoAprobacionDto[];
  /** Presupuesto del que este es una nueva versión (solo Principales). */
  predecesor: Ppto | null;
}

const redondear2 = (n: number) => Math.round(n * 100) / 100;
const suma = (nums: readonly number[]) => nums.reduce((a, b) => a + b, 0);

/**
 * Aprobación del presupuesto (GRP G-01, G-04, G-10). La acción **Aprobar** es el único punto que cambia el
 * presupuesto a APROBADO y captura la estructura de la obra, todo en la misma transacción (SP-01).
 * Reglas (DG15): un centro de costo no tiene un segundo Principal aprobado nuevo (se crea un adicional); los
 * presupuestos antiguos no se tocan. Una nueva versión solo se admite mientras la obra no tenga avance (S-04).
 */
@Injectable()
export class AprobacionPresupuestoHandler {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sql: AlmacenSql,
    private readonly conciliacion: ConciliarCompromisosService,
    private readonly ledger: InventarioLedger,
  ) {}

  async validacion(idOrCode: string | number): Promise<ValidacionPresupuestoResponseDto> {
    const orm = this.db.orm.public;
    const ppto = await this.cargar(orm, idOrCode);
    const arbol = await this.arbol(orm, ppto);
    const { tipo, bloqueos } = await this.evaluar(orm, ppto);
    const problemas = validarPresupuesto(arbol);
    return {
      id: ppto.id,
      id_presupuesto: ppto.IdPresupuesto ?? null,
      estado_ppto: ppto.estado_ppto,
      tipo,
      puede_aprobar: problemas.length === 0 && bloqueos.length === 0,
      problemas,
      bloqueos,
      resumen: resumir(arbol),
    };
  }

  /**
   * Presupuesto Comercial (SP-16): se calcula, no se digita. Cada fase del Meta toma el monto sin IGV de la cotización ganadora
   * de su(s) FUR (en soles, con el tipo de cambio de venta del día de la cotización); sin ganadora conserva el del Meta.
   */
  async comercial(idOrCode: string | number): Promise<ComercialResponseDto> {
    const ppto = await this.cargar(this.db.orm.public, idOrCode);
    const q = sqlTag(this.sql);
    const fases = await q.rows<{ id_fase: number; nombre: string; meta: string }>({ id_fase: I, nombre: T, meta: T })`
      SELECT COALESCE(f.id, df.id) AS id_fase, COALESCE(f."FaseProyecto", df."IdpptoFase", 'Fase #' || df.id)::text AS nombre,
             COALESCE(df."CostoDirecto", 0)::text AS meta
        FROM "ppto_DetalleFases" df
        LEFT JOIN "ppto_Fases" f ON f."IdpptoFase" = df."IdpptoFase"
       WHERE df."IdPresupuesto" = ${ppto.IdPresupuesto ?? ''}::text
       ORDER BY df.id`;
    const metas: FaseMeta[] = fases.map((f) => ({ id_fase: f.id_fase, nombre_fase: f.nombre, meta: Number(f.meta) }));

    const ganadoras: OfertaGanadora[] = [];
    if (ppto.id_centro_costo !== null && metas.length > 0) {
      const furs = await q.rows<{
        id_fur: number; numero: string; estado: string; id_fase: number; id_cot: number; moneda_id: string; simbolo: string | null;
        incluye_igv: boolean; afecto_igv: boolean; fecha: string; proveedor: string | null;
      }>({ id_fur: I, numero: T, estado: T, id_fase: I, id_cot: I, moneda_id: T, simbolo: TN, incluye_igv: B, afecto_igv: B, fecha: T, proveedor: TN })`
        SELECT r.id AS id_fur, r.numero::text AS numero, r.estado::text AS estado, r.id_fase, c.id AS id_cot, c.moneda_id::text AS moneda_id,
               c.moneda_simbolo::text AS simbolo, c.incluye_igv, c.afecto_igv, c.fecha::text AS fecha,
               COALESCE(a."NombreComercial", a."Anexo")::text AS proveedor
          FROM requerimiento r
          JOIN cotizacion c ON c.id = r.id_cotizacion_ganadora
          LEFT JOIN anexos a ON a.id = c.id_proveedor
         WHERE r.id_centro_costo = ${ppto.id_centro_costo}::int AND r.estado::text <> 'ANULADO' AND r.id_fase IS NOT NULL
           AND r.origen::text <> 'PPTO_ADJUDICACION' -- plan 09: los FUR de adjudicación ya se cuentan por ítem
         ORDER BY r.id`;
      const idsCot = furs.map((f) => f.id_cot);
      const lineas = idsCot.length
        ? await q.rows<{ id_cotizacion: number; cotiza: boolean; cantidad: string; precio: string }>({ id_cotizacion: I, cotiza: B, cantidad: T, precio: T })`
            SELECT id_cotizacion, cotiza, cantidad::text AS cantidad, precio_unitario::text AS precio
              FROM cotizacion_detalle WHERE id_cotizacion = ANY(string_to_array(${csv(idsCot)}::text, ',')::int[])`
        : [];
      for (const f of furs) {
        const total = totalesCotizacion(
          lineas.filter((l) => l.id_cotizacion === f.id_cot).map((l) => ({ cotiza: l.cotiza, cantidad: Number(l.cantidad), precio: Number(l.precio) })),
          f.incluye_igv,
          f.afecto_igv,
        ).subtotal;
        let monto: number | null = total;
        if (!esSoles(f.moneda_id, f.simbolo)) {
          const tc = await tcVigente(this.sql, claveMoneda(f.moneda_id, f.simbolo), f.fecha);
          monto = tc ? redondear2(total * Number(tc.venta)) : null;
        }
        ganadoras.push({
          id_fase: f.id_fase,
          id_requerimiento: f.id_fur,
          numero_requerimiento: f.numero,
          estado_requerimiento: f.estado,
          proveedor: f.proveedor,
          monto,
        });
      }
    }
    const items = metas.length > 0 ? await this.itemsComercial(String(ppto.IdPresupuesto ?? '')) : [];
    return {
      id: ppto.id,
      id_presupuesto: ppto.IdPresupuesto ?? null,
      proyecto: ppto.Proyecto ?? null,
      id_centro_costo: ppto.id_centro_costo ?? null,
      estado_ppto: ppto.estado_ppto,
      ...armarComercial(metas, ganadoras, items),
    };
  }

  /**
   * Ítems del Meta con su proveedor ganador (plan 09). El precio unitario sin IGV del ganador se lleva a soles con el tipo de cambio de venta
   * del día de la cotización; sin tipo de cambio el ítem queda al costo del Meta y la fase lo avisa.
   */
  private async itemsComercial(codigo: string): Promise<ItemComercialEntrada[]> {
    const q = sqlTag(this.sql);
    const filas = await q.rows<{
      id_fase: number; id_item: number; codigo: string; descripcion: string; cantidad: string; costo_meta: string; proveedor: string | null;
      precio: string | null; moneda_id: string | null; simbolo: string | null; incluye_igv: boolean | null; afecto_igv: boolean | null; fecha: string | null;
    }>({ id_fase: I, id_item: I, codigo: T, descripcion: T, cantidad: T, costo_meta: T, proveedor: TN, precio: TN, moneda_id: TN, simbolo: TN, incluye_igv: { codecId: 'pg/bool@1', nullable: true }, afecto_igv: { codecId: 'pg/bool@1', nullable: true }, fecha: TN })`
      SELECT COALESCE(m.id, df.id) AS id_fase, i.id AS id_item, p.codigo::text AS codigo, p.descripcion::text AS descripcion,
             i."Cantidad"::text AS cantidad, i."CostoTotal"::text AS costo_meta, COALESCE(a."NombreComercial", a."Anexo")::text AS proveedor,
             g.precio_unitario::text AS precio, q.moneda_id::text AS moneda_id, q.moneda_simbolo::text AS simbolo, q.incluye_igv, q.afecto_igv, q.fecha::text AS fecha
        FROM "ppto_DetalleItems" i
        JOIN "ppto_DetalleFasesCate" c ON c.id = i.id_detalle_categoria
        JOIN "ppto_DetalleFases" df ON df."IdPresupuestoDetalle" = c."IdPresupuestoDetalle"
        LEFT JOIN "ppto_Fases" m ON m."IdpptoFase" = df."IdpptoFase"
        JOIN producto p ON p.id = i.id_producto
        LEFT JOIN ppto_cotizacion_detalle g ON g.id = i.id_ppto_cot_detalle_ganadora
        LEFT JOIN ppto_cotizacion q ON q.id = g.id_cotizacion
        LEFT JOIN anexos a ON a.id = q.id_proveedor
       WHERE i."IdPresupuesto" = ${codigo}::text AND df."IdPresupuesto" = ${codigo}::text AND i."Cantidad" > 0
       ORDER BY df.id, c.id, i."Orden", i.id`;
    const resultado: ItemComercialEntrada[] = [];
    for (const f of filas) {
      let adjudicado: ItemComercialEntrada['adjudicado'] = null;
      if (f.precio !== null && f.moneda_id !== null) {
        const sin = preciosOferta(Number(f.precio), f.incluye_igv ?? false, f.afecto_igv ?? true).sin;
        let enSoles: number | null = sin;
        if (!esSoles(f.moneda_id, f.simbolo)) {
          const tc = await tcVigente(this.sql, claveMoneda(f.moneda_id, f.simbolo), f.fecha ?? hoyLima());
          enSoles = tc ? sin * Number(tc.venta) : null;
        }
        adjudicado = { proveedor: f.proveedor, precio_sin_igv: enSoles };
      }
      resultado.push({ id_fase: f.id_fase, id_item: f.id_item, codigo: f.codigo, descripcion: f.descripcion, cantidad: Number(f.cantidad), costo_meta: Number(f.costo_meta), adjudicado });
    }
    return resultado;
  }

  async aprobar(idOrCode: string | number, user: AuthUser | undefined): Promise<AprobarPresupuestoResponseDto> {
    const previo = await this.cargar(this.db.orm.public, idOrCode);
    const idCc = previo.id_centro_costo;
    if (!idCc) throw new BadRequestException('El presupuesto debe estar vinculado a un centro de costo para aprobarse');
    const quien = user?.usuario ?? 'SISTEMA';
    const q = sqlTag(this.sql);

    const r = await this.db.transaction(async (tx) => {
      const orm = tx.orm.public;
      // Serializa las aprobaciones del mismo centro de costo: dos Principales no pueden aprobarse a la vez.
      await q.rows<{ id: number }>({ id: I }, tx)`SELECT id FROM "CentroCostos" WHERE id = ${idCc}::int FOR UPDATE`;

      const ppto = await this.cargar(orm, previo.id);
      const { tipo, bloqueos, predecesor } = await this.evaluar(orm, ppto, tx);
      // Primero lo de estado (409), luego que el presupuesto esté completo (400) y por último que todo ítem tenga proveedor (409):
      // así quien arma el presupuesto ve primero qué le falta y recién después se le pide adjudicar.
      const porAdjudicar = ['ITEMS_SIN_ADJUDICAR', 'COMPROMISO_EN_CONFLICTO'];
      const duros = bloqueos.filter((b) => !porAdjudicar.includes(b.codigo));
      if (duros.length > 0) throw new ConflictException({ message: duros[0].mensaje, bloqueos: duros });
      const arbol = await this.arbol(orm, ppto);
      const problemas = validarPresupuesto(arbol);
      if (problemas.length > 0) {
        throw new BadRequestException({
          message: `El presupuesto no está completo (${problemas.length} pendiente(s)): ${problemas[0].mensaje}`,
          problemas,
        });
      }
      const pendientes = bloqueos.filter((b) => porAdjudicar.includes(b.codigo));
      if (pendientes.length > 0) throw new ConflictException({ message: pendientes[0].mensaje, bloqueos: pendientes });

      const cc = await orm.CentroCostos.first({ id: idCc });
      const inicio = cc?.fecha_inicio ? readDateOnly(cc.fecha_inicio) : '';
      const fin = cc?.fecha_fin_prog ? readDateOnly(cc.fecha_fin_prog) : '';
      const codigo = ppto.IdPresupuesto as string;

      // Una nueva versión del Principal reemplaza la estructura de la obra, y solo si no hay avance (S-04, DG4).
      const esVersion = tipo === 'Principal' && predecesor !== null;
      const partidasActuales = await orm.obra_partida.where({ id_centro_costo: idCc }).all();
      // La nueva versión reemplaza solo la estructura contractual: las partidas de los adicionales se conservan.
      const contractuales = partidasActuales.filter((p) => p.tipo === 'CONTRACTUAL');
      if (esVersion && contractuales.length > 0) {
        const subs = await orm.obra_subpartida.where({ id_centro_costo: idCc }).all();
        if ((await subpartidasConAvance(orm, subs.map((s) => s.id))) > 0) {
          throw new ConflictException(
            'La obra ya tiene avance registrado: no se puede reemplazar su estructura con una nueva versión. Cree el cambio como presupuesto adicional',
          );
        }
      }

      // El monto aprobado es la suma de los ítems: se recalcula antes de capturar (la cabecera pudo quedar atrás).
      await this.recalcularCostos(orm, ppto, arbol, new Set());

      // Plan 09: las órdenes provisionales generadas al grabar se cierran: pasan a REGISTRADO y entran a programación y pago.
      const bloqueado = await bloquearPresupuesto(this.sql, tx, ppto.id);
      await this.conciliacion.conciliar(tx, bloqueado, user);
      const documentosCerrados = await this.conciliacion.cerrar(tx, bloqueado);

      await orm.ppto_Principal.where({ id: ppto.id }).update({
        estado_ppto: 'APROBADO',
        Estado: toVarchar<50>(textoLegado('APROBADO')),
        aprobado_por: toVarchar<255>(quien),
        fecha_aprobacion: nowInstant(),
      });

      let reemplaza: AprobarPresupuestoResponseDto['reemplaza'];
      if (esVersion && predecesor.estado_ppto !== 'ANULADO') {
        await orm.ppto_Principal.where({ id: predecesor.id }).update({
          estado_ppto: 'ANULADO',
          Estado: toVarchar<50>(textoLegado('ANULADO')),
        });
        reemplaza = { id: predecesor.id, id_presupuesto: predecesor.IdPresupuesto ?? null };
        // Plan 09 (T-52): el FUR y las órdenes provisionales de la versión que se reemplaza se anulan; las registradas se conservan.
        await this.conciliacion.anularProvisionales(
          tx,
          { id: predecesor.id, codigo: predecesor.IdPresupuesto ?? '', estado: 'ANULADO', id_centro_costo: predecesor.id_centro_costo ?? null },
          `Reemplazado por la versión ${codigo}`,
        );
      }

      let estructura: EstructuraCapturadaDto;
      if (!inicio || !fin) {
        estructura = {
          capturada: false,
          partidas: 0,
          subpartidas: 0,
          motivo: 'El centro de costo no tiene inicio y fin programado: defínalos y use «Importar de presupuesto» en el control de avance',
        };
      } else if (tipo === 'Principal' && !esVersion && partidasActuales.length > 0) {
        estructura = {
          capturada: false,
          partidas: 0,
          subpartidas: 0,
          motivo: 'La obra ya tiene estructura de control y no se reemplazó: use «Importar de presupuesto» si corresponde',
        };
      } else {
        if (esVersion && contractuales.length > 0) {
          await orm.obra_partida.where({ id_centro_costo: idCc, tipo: 'CONTRACTUAL' }).delete();
        }
        const c = await capturarEstructura(orm, {
          idCentroCosto: idCc,
          ppto: { id: ppto.id, IdPresupuesto: codigo },
          inicio,
          fin,
          modo: tipo === 'Adicional' ? 'adicional' : 'principal',
        });
        estructura = { capturada: c.partidas > 0, partidas: c.partidas, subpartidas: c.subpartidas };
        if (estructura.capturada) {
          await registrarEvento(orm, {
            idCentroCosto: idCc,
            tipo: 'ALTA',
            titulo: `Presupuesto ${codigo} aprobado: estructura capturada`,
            detalle: `${c.partidas} partida(s) y ${c.subpartidas} subpartida(s)${tipo === 'Adicional' ? ' (adicional)' : ''}${reemplaza ? ` · reemplaza a ${reemplaza.id_presupuesto ?? `#${reemplaza.id}`}` : ''}`,
            usuario: quien,
          });
        }
      }

      await sincronizarPresupuestoCc(orm, idCc);
      return { id: ppto.id, codigo, tipo, estructura, reemplaza, documentosCerrados };
    });

    // La respuesta se arma después del commit.
    return {
      id: r.id,
      id_presupuesto: r.codigo,
      estado_ppto: 'APROBADO',
      tipo: r.tipo,
      estructura: r.estructura,
      ...(r.reemplaza ? { reemplaza: r.reemplaza } : {}),
      documentos_cerrados: r.documentosCerrados,
    };
  }

  /** Borra los ítems en cero y las categorías sin ítems, y deja al día los costos (fase, presupuesto y centro de costo). */
  async limpiarVacios(idOrCode: string | number): Promise<LimpiarVaciosResponseDto> {
    const previo = await this.cargar(this.db.orm.public, idOrCode);
    return this.db.transaction(async (tx) => {
      const orm = tx.orm.public;
      const ppto = await this.cargar(orm, previo.id);
      if (!ESTADOS_EDITABLES.includes(ppto.estado_ppto as EstadoPpto)) {
        throw new ConflictException('El presupuesto ya está aprobado o anulado: no se puede limpiar');
      }
      const arbol = await this.arbol(orm, ppto);
      const plan = planificarLimpieza(arbol);

      if (plan.itemsABorrar.length > 0) await orm.ppto_DetalleItems.where((i) => i.id.in(plan.itemsABorrar)).deleteAndCount();
      if (plan.categoriasABorrar.length > 0) {
        await orm.ppto_DetalleFasesCate.where((c) => c.id.in(plan.categoriasABorrar)).deleteAndCount();
      }

      const costoPresupuesto = await this.recalcularCostos(orm, ppto, arbol, new Set(plan.categoriasABorrar));
      if (ppto.id_centro_costo) await sincronizarPresupuestoCc(orm, ppto.id_centro_costo);

      return {
        items_eliminados: plan.itemsABorrar.length,
        categorias_eliminadas: plan.categoriasABorrar.length,
        fases_sin_categorias: plan.fasesSinCategorias,
        costo_directo: costoPresupuesto.toFixed(2),
      };
    });
  }

  /**
   * Nueva versión de un Principal: copia fases, categorías e ítems a un presupuesto nuevo en desarrollo. Solo si la obra
   * no tiene avance; con avance el cambio se registra como adicional (S-04). La versión anterior pasa a ANULADO
   * recién cuando se apruebe la nueva (DG4).
   */
  async nuevaVersion(idOrCode: string | number, usuario: string | undefined): Promise<NuevaVersionResponseDto> {
    const previo = await this.cargar(this.db.orm.public, idOrCode);
    const idCc = previo.id_centro_costo;
    if (!idCc) throw new BadRequestException('El presupuesto debe estar vinculado a un centro de costo para tener versiones');
    if (esAdicional(previo.TipoPpto, previo.Concepto)) {
      throw new BadRequestException('Solo el presupuesto Principal tiene versiones: para un cambio posterior cree un adicional');
    }
    if (!previo.IdPresupuesto) throw new BadRequestException('El presupuesto no tiene código IdPresupuesto válido');
    const q = sqlTag(this.sql);

    try {
      return await this.db.transaction(async (tx) => {
        const orm = tx.orm.public;
        await q.rows<{ id: number }>({ id: I }, tx)`SELECT id FROM "CentroCostos" WHERE id = ${idCc}::int FOR UPDATE`;

        const origen = await this.cargar(orm, previo.id);
        if (origen.estado_ppto === 'ANULADO') throw new ConflictException('No se crea una versión de un presupuesto anulado');
        const subs = await orm.obra_subpartida.where({ id_centro_costo: idCc }).all();
        if ((await subpartidasConAvance(orm, subs.map((s) => s.id))) > 0) {
          throw new ConflictException(
            'La obra ya tiene avance registrado: no se puede crear una nueva versión. Cree el cambio como presupuesto adicional',
          );
        }

        const delCc = await orm.ppto_Principal.where({ id_centro_costo: idCc }).all();
        const numero = Math.max(1, ...delCc.filter((p) => !esAdicional(p.TipoPpto, p.Concepto)).map((p) => p.numero_version ?? 1)) + 1;
        const codigo = await siguienteCodigo(orm);
        const ahora = toVarchar(new Date().toISOString());
        const quien = toVarchar(usuario ?? 'SISTEMA');

        const nuevo = await orm.ppto_Principal.create({
          IdPresupuesto: toVarchar(codigo),
          id_empresa: origen.id_empresa,
          periodo: origen.periodo,
          Version: toVarchar(`V${numero}`),
          CodigoAnexo: origen.CodigoAnexo,
          TipoPpto: origen.TipoPpto,
          Proyecto: origen.Proyecto,
          Concepto: origen.Concepto,
          CodCentroCtoPrincipal: origen.CodCentroCtoPrincipal,
          CodCentroCto: origen.CodCentroCto,
          id_centro_costo: origen.id_centro_costo,
          FechaRequerimiento: origen.FechaRequerimiento,
          FechaEntrega: origen.FechaEntrega,
          CostoDirecto: origen.CostoDirecto,
          GGPorcentaje: origen.GGPorcentaje,
          GastosGenerales: origen.GastosGenerales,
          UtiliPorcentaje: origen.UtiliPorcentaje,
          Utilidad: origen.Utilidad,
          Viaticos: origen.Viaticos,
          DsctoComercial: origen.DsctoComercial,
          SubTotalSinIGV: origen.SubTotalSinIGV,
          IGV: origen.IGV,
          Total: origen.Total,
          Estado: toVarchar<50>(textoLegado('EN_DESARROLLO')),
          estado_ppto: 'EN_DESARROLLO',
          numero_version: numero,
          id_version_de: origen.id,
          Comentarios: origen.Comentarios,
          id_categoria: origen.id_categoria,
          Usuario: quien,
          FechaCreacion: ahora,
        });
        await orm.ppto_Principal_Historial
          .create({
            IdPresupuesto: toVarchar(codigo),
            IdPresupuestoVersion: toVarchar(`${codigo}-V${numero}`),
            NumVersion: toVarchar(String(numero)),
          })
          .catch(() => null);

        const [fases, cates, items] = await Promise.all([
          orm.ppto_DetalleFases.where({ IdPresupuesto: previo.IdPresupuesto as NonNullable<typeof previo.IdPresupuesto> }).all(),
          orm.ppto_DetalleFasesCate.where({ IdPresupuesto: previo.IdPresupuesto as NonNullable<typeof previo.IdPresupuesto> }).all(),
          orm.ppto_DetalleItems.where({ IdPresupuesto: previo.IdPresupuesto as NonNullable<typeof previo.IdPresupuesto> }).all(),
        ]);
        const stamp = Date.now();
        const idFaseNueva = new Map<string, string>();
        const faseNuevaPorId = new Map<number, number>();
        const itemNuevoPorId = new Map<number, number>();
        for (const [i, f] of [...fases].sort((a, b) => a.id - b.id).entries()) {
          const idDetalle = `DF-${stamp}-${i}`;
          if (f.IdPresupuestoDetalle) idFaseNueva.set(f.IdPresupuestoDetalle, idDetalle);
          const faseCreada = await orm.ppto_DetalleFases.create({
            IdPresupuestoDetalle: toVarchar(idDetalle),
            IdPresupuesto: toVarchar(codigo),
            id_empresa: f.id_empresa,
            CodCentroCtoPrincipal: f.CodCentroCtoPrincipal,
            CodCentroCto: f.CodCentroCto,
            id_centro_costo: f.id_centro_costo,
            IdpptoFase: f.IdpptoFase,
            CostoDirecto: f.CostoDirecto,
            id_categoria: f.id_categoria,
            Usuario: quien,
            FechaCreacion: ahora,
          });
          faseNuevaPorId.set(f.id, faseCreada.id);
        }
        const nuevaCat = new Map<number, number>();
        for (const [j, c] of [...cates].sort((a, b) => a.id - b.id).entries()) {
          const creada = await orm.ppto_DetalleFasesCate.create({
            IdPresupuestoDetalleCategoria: toVarchar(`DFC-${stamp}-${j}`),
            IdPresupuesto: toVarchar(codigo),
            IdPresupuestoDetalle: toVarchar((c.IdPresupuestoDetalle && idFaseNueva.get(c.IdPresupuestoDetalle)) || ''),
            id_empresa: c.id_empresa,
            CodCentroCtoPrincipal: c.CodCentroCtoPrincipal,
            CodCentroCto: c.CodCentroCto,
            id_centro_costo: c.id_centro_costo,
            IdpptoFase: c.IdpptoFase,
            IdpptoFaseCategoria: c.IdpptoFaseCategoria,
            CostoDirecto: c.CostoDirecto,
            id_categoria: c.id_categoria,
            Usuario: quien,
            FechaCreacion: ahora,
          });
          nuevaCat.set(c.id, creada.id);
        }
        let totalItems = 0;
        for (const it of [...items].sort((a, b) => a.id - b.id)) {
          const idCat = nuevaCat.get(it.id_detalle_categoria);
          if (idCat === undefined) continue;
          totalItems++;
          const itemCreado = await orm.ppto_DetalleItems.create({
            id_detalle_categoria: idCat,
            IdPresupuesto: toVarchar(codigo),
            id_producto: it.id_producto,
            id_unidad_medida: it.id_unidad_medida,
            Item: it.Item,
            Cantidad: it.Cantidad,
            CostoUnitario: it.CostoUnitario,
            PrecioVenta: it.PrecioVenta,
            CostoTotal: it.CostoTotal,
            VentaTotal: it.VentaTotal,
            Orden: it.Orden,
            // Plan 09 (§3.7): de qué ítem viene (para saber lo que las versiones anteriores ya pidieron).
            id_item_origen: it.id,
          });
          itemNuevoPorId.set(it.id, itemCreado.id);
        }

        // Las cotizaciones y los proveedores ganadores viajan a la versión nueva (con las líneas mapeadas a los ítems nuevos).
        const copiado = await this.copiarCotizaciones(tx, origen.id, String(previo.IdPresupuesto), nuevo.id, faseNuevaPorId, itemNuevoPorId, usuario ?? 'SISTEMA');

        await sincronizarPresupuestoCc(orm, idCc);
        return {
          id: nuevo.id,
          id_presupuesto: codigo,
          numero_version: numero,
          id_version_de: origen.id,
          fases: fases.length,
          categorias: cates.length,
          items: totalItems,
          cotizaciones: copiado.cotizaciones,
          adjudicaciones: copiado.adjudicaciones,
        };
      });
    } catch (e) {
      throwIfUniqueViolation(e, 'No se pudo crear la versión: el código del presupuesto ya existe, intente de nuevo');
      throw e;
    }
  }

  /**
   * Copia las cotizaciones de un presupuesto a su nueva versión (plan 09, §3.7): cabeceras con número nuevo, líneas mapeadas a los ítems
   * nuevos y el proveedor ganador de cada ítem con su trazabilidad. Devuelve cuántas cotizaciones y adjudicaciones se copiaron.
   */
  private async copiarCotizaciones(
    tx: Parameters<Database['transaction']>[0] extends (tx: infer T) => unknown ? T : never,
    idOrigen: number,
    codigoOrigen: string,
    idNuevo: number,
    fases: Map<number, number>,
    items: Map<number, number>,
    usuario: string,
  ): Promise<{ cotizaciones: number; adjudicaciones: number }> {
    const q = sqlTag(this.sql);
    const cots = await q.rows<{ id: number; id_detalle_fase: number }>({ id: I, id_detalle_fase: I }, tx)`
      SELECT id, id_detalle_fase FROM ppto_cotizacion WHERE id_presupuesto = ${idOrigen}::int ORDER BY id`;
    const lineaNueva = new Map<number, number>();
    let cotizaciones = 0;
    for (const c of cots) {
      const faseNueva = fases.get(c.id_detalle_fase);
      if (faseNueva === undefined) continue;
      const numero = await this.ledger.siguienteNumero(tx, 'COT');
      const [nueva] = await q.rows<{ id: number }>({ id: I }, tx)`
        INSERT INTO ppto_cotizacion (numero, id_presupuesto, id_detalle_fase, id_proveedor, fecha, referencia, moneda_id, moneda_simbolo, incluye_igv,
                                     afecto_igv, forma_pago, dias_credito, adelanto_porcentaje, medio_pago, plazo_entrega_dias, validez_dias, garantia,
                                     condiciones, archivo_url, registrado_por)
        SELECT ${numero}::text, ${idNuevo}::int, ${faseNueva}::int, id_proveedor, fecha, referencia, moneda_id, moneda_simbolo, incluye_igv,
               afecto_igv, forma_pago, dias_credito, adelanto_porcentaje, medio_pago, plazo_entrega_dias, validez_dias, garantia, condiciones,
               archivo_url, ${usuario}::text
          FROM ppto_cotizacion WHERE id = ${c.id}::int
        RETURNING id`;
      cotizaciones += 1;
      const lineas = await q.rows<{ id: number; id_ppto_item: number }>({ id: I, id_ppto_item: I }, tx)`
        SELECT id, id_ppto_item FROM ppto_cotizacion_detalle WHERE id_cotizacion = ${c.id}::int ORDER BY id`;
      for (const l of lineas) {
        const itemNuevo = items.get(l.id_ppto_item);
        if (itemNuevo === undefined) continue;
        const [nl] = await q.rows<{ id: number }>({ id: I }, tx)`
          INSERT INTO ppto_cotizacion_detalle (id_cotizacion, id_ppto_item, cotiza, cantidad, precio_unitario, plazo_entrega_dias, marca_modelo, observaciones)
          SELECT ${nueva.id}::int, ${itemNuevo}::int, cotiza, cantidad, precio_unitario, plazo_entrega_dias, marca_modelo, observaciones
            FROM ppto_cotizacion_detalle WHERE id = ${l.id}::int
          RETURNING id`;
        lineaNueva.set(l.id, nl.id);
      }
    }

    const ganadores = await q.rows<{ id: number; ganadora: number }>({ id: I, ganadora: I }, tx)`
      SELECT i.id, i.id_ppto_cot_detalle_ganadora AS ganadora FROM "ppto_DetalleItems" i
       WHERE i."IdPresupuesto" = ${codigoOrigen}::text AND i.id_ppto_cot_detalle_ganadora IS NOT NULL ORDER BY i.id`;
    let adjudicaciones = 0;
    for (const g of ganadores) {
      const itemNuevo = items.get(g.id);
      const lineaGanadora = lineaNueva.get(g.ganadora);
      if (itemNuevo === undefined || lineaGanadora === undefined) continue;
      await q.run(tx)`
        UPDATE "ppto_DetalleItems" n
           SET id_ppto_cot_detalle_ganadora = ${lineaGanadora}::int, adjudicado_por = o.adjudicado_por,
               fecha_adjudicacion = o.fecha_adjudicacion, comentario_adjudicacion = o.comentario_adjudicacion
          FROM "ppto_DetalleItems" o
         WHERE n.id = ${itemNuevo}::int AND o.id = ${g.id}::int`;
      adjudicaciones += 1;
    }
    return { cotizaciones, adjudicaciones };
  }

  /**
   * Deja los costos de acuerdo con los ítems: la categoría es la suma de sus ítems, la fase la suma de sus categorías y
   * la cabecera la suma de sus fases. Los gastos generales y la utilidad se recalculan desde su porcentaje; sin
   * porcentaje queda el monto fijo. Una fase sin categorías conserva su monto (la validación no la deja aprobar).
   * Devuelve el costo directo del presupuesto.
   */
  private async recalcularCostos(
    orm: Orm,
    ppto: Ppto,
    arbol: readonly FasePresupuesto[],
    categoriasBorradas: ReadonlySet<number>,
  ): Promise<number> {
    let costoPresupuesto = 0;
    for (const fase of arbol) {
      if (fase.categorias.length === 0) {
        costoPresupuesto += fase.costoDirecto;
        continue;
      }
      let costoFase = 0;
      for (const cat of fase.categorias) {
        if (categoriasBorradas.has(cat.id)) continue;
        const costoCat = redondear2(suma(cat.items.filter((i) => !itemVacio(i)).map((i) => redondear2(i.cantidad * i.costoUnitario))));
        await orm.ppto_DetalleFasesCate.where({ id: cat.id }).update({ CostoDirecto: toDecimalString(costoCat) });
        costoFase += costoCat;
      }
      costoFase = redondear2(costoFase);
      await orm.ppto_DetalleFases.where({ id: fase.id }).update({ CostoDirecto: toDecimalString(costoFase) });
      costoPresupuesto += costoFase;
    }
    costoPresupuesto = redondear2(costoPresupuesto);

    const ggPct = Number(ppto.GGPorcentaje ?? 0);
    const utPct = Number(ppto.UtiliPorcentaje ?? 0);
    const montos = calculateAmounts({
      CostoDirecto: costoPresupuesto,
      GGPorcentaje: ggPct,
      GastosGenerales: ggPct > 0 ? undefined : Number(ppto.GastosGenerales ?? 0),
      UtiliPorcentaje: utPct,
      Utilidad: utPct > 0 ? undefined : Number(ppto.Utilidad ?? 0),
      Viaticos: Number(ppto.Viaticos ?? 0),
      DsctoComercial: Number(ppto.DsctoComercial ?? 0),
    });
    await orm.ppto_Principal.where({ id: ppto.id }).update({
      CostoDirecto: toDecimalString(costoPresupuesto),
      GastosGenerales: toDecimalString(montos.gastosGenerales),
      Utilidad: toDecimalString(montos.utilidad),
      SubTotalSinIGV: toDecimalString(montos.subTotal),
      IGV: toDecimalString(montos.igv),
      Total: toDecimalString(montos.total),
    });
    return costoPresupuesto;
  }

  // ── Lectura ───────────────────────────────────────────────────────────────────────────────────────────────

  /** Busca por código `IdPresupuesto` o por id numérico (un `number` busca solo por id). */
  private async cargar(orm: Orm, idOrCode: string | number): Promise<Ppto> {
    let row: Ppto | null = null;
    if (typeof idOrCode === 'string') row = await orm.ppto_Principal.first({ IdPresupuesto: toVarchar(idOrCode) });
    const numero = typeof idOrCode === 'number' ? idOrCode : /^\d+$/.test(idOrCode) ? Number(idOrCode) : null;
    if (!row && numero !== null) row = await orm.ppto_Principal.first({ id: numero });
    if (!row) throw new NotFoundException(`Presupuesto "${idOrCode}" no encontrado`);
    return row;
  }

  /** Fases → categorías → ítems del presupuesto, con los nombres del catálogo. */
  private async arbol(orm: Orm, ppto: Ppto): Promise<FasePresupuesto[]> {
    const codigo = ppto.IdPresupuesto;
    if (!codigo) throw new BadRequestException('El presupuesto no tiene código IdPresupuesto válido');
    const [fases, cates, items, maestroFases, maestroCats] = await Promise.all([
      orm.ppto_DetalleFases.where({ IdPresupuesto: codigo }).all(),
      orm.ppto_DetalleFasesCate.where({ IdPresupuesto: codigo }).all(),
      orm.ppto_DetalleItems.where({ IdPresupuesto: codigo }).all(),
      orm.ppto_Fases.all(),
      orm.ppto_FasesCategorias.all(),
    ]);
    const nombreFase = new Map(maestroFases.map((f) => [f.IdpptoFase, f.FaseProyecto]));
    const nombreCat = new Map(maestroCats.map((c) => [c.IdpptoFaseCategoria, c.Descripcion]));
    const itemsPorCat = new Map<number, { id: number; cantidad: number; costoUnitario: number }[]>();
    for (const it of items) {
      const lista = itemsPorCat.get(it.id_detalle_categoria) ?? [];
      lista.push({ id: it.id, cantidad: Number(it.Cantidad), costoUnitario: Number(it.CostoUnitario) });
      itemsPorCat.set(it.id_detalle_categoria, lista);
    }
    return [...fases]
      .sort((a, b) => a.id - b.id)
      .map((f) => ({
        id: f.id,
        nombre: (f.IdpptoFase && nombreFase.get(f.IdpptoFase)) || f.IdpptoFase || `Fase #${f.id}`,
        costoDirecto: Number(f.CostoDirecto) || 0,
        categorias: cates
          .filter((c) => !!f.IdPresupuestoDetalle && c.IdPresupuestoDetalle === f.IdPresupuestoDetalle)
          .sort((a, b) => a.id - b.id)
          .map((c) => ({
            id: c.id,
            nombre: (c.IdpptoFaseCategoria && nombreCat.get(c.IdpptoFaseCategoria)) || c.IdpptoFaseCategoria || `Categoría #${c.id}`,
            items: itemsPorCat.get(c.id) ?? [],
          })),
      }));
  }

  /** Reglas de negocio que impiden aprobar (aparte de lo que falta completar en el presupuesto). */
  private async evaluar(orm: Orm, ppto: Ppto, tx?: Parameters<typeof itemsSinAdjudicar>[2]): Promise<Evaluacion> {
    const tipo = esAdicional(ppto.TipoPpto, ppto.Concepto) ? 'Adicional' : 'Principal';
    const bloqueos: BloqueoAprobacionDto[] = [];
    if (esAprobado(ppto.estado_ppto)) bloqueos.push({ codigo: 'YA_APROBADO', mensaje: 'El presupuesto ya está aprobado' });
    else if (ppto.estado_ppto === 'ANULADO') bloqueos.push({ codigo: 'ANULADO', mensaje: 'El presupuesto está anulado' });

    if (!ppto.id_centro_costo) {
      bloqueos.push({ codigo: 'SIN_CENTRO_COSTO', mensaje: 'El presupuesto debe estar vinculado a un centro de costo' });
      return { tipo, bloqueos, predecesor: null };
    }
    const delCc = await orm.ppto_Principal.where({ id_centro_costo: ppto.id_centro_costo }).all();
    const aprobados = delCc.filter((p) => p.id !== ppto.id && esAprobado(p.estado_ppto));
    const predecesor = tipo === 'Principal' && ppto.id_version_de ? (delCc.find((p) => p.id === ppto.id_version_de) ?? null) : null;

    if (tipo === 'Principal') {
      const otros = aprobados.filter((p) => !esAdicional(p.TipoPpto, p.Concepto) && p.id !== predecesor?.id);
      if (otros.length > 0) {
        bloqueos.push({
          codigo: 'OTRO_PRINCIPAL',
          mensaje: `El centro de costo ya tiene un presupuesto Principal aprobado (${otros.map((o) => o.IdPresupuesto ?? `#${o.id}`).join(', ')}): cree este como adicional`,
        });
      }
    } else if (!aprobados.some((p) => !esAdicional(p.TipoPpto, p.Concepto))) {
      bloqueos.push({ codigo: 'SIN_PRINCIPAL', mensaje: 'Apruebe primero el presupuesto Principal del centro de costo' });
    }
    // Plan 09 (D-11): todo ítem tiene que tener un proveedor ganador antes de aprobar.
    if (ppto.IdPresupuesto && !esAprobado(ppto.estado_ppto) && ppto.estado_ppto !== 'ANULADO') {
      const sin = await itemsSinAdjudicar(this.sql, String(ppto.IdPresupuesto), tx);
      if (sin.length > 0) {
        const lista = sin.slice(0, 5).map((i) => i.codigo).join(', ');
        bloqueos.push({
          codigo: 'ITEMS_SIN_ADJUDICAR',
          mensaje: `Faltan ${sin.length} ítem(s) por adjudicar a un proveedor (${lista}${sin.length > 5 ? '…' : ''}): registre sus cotizaciones y elija al ganador`,
        });
      }
      // Plan 09 (§3.7): un ítem que una versión anterior ya pidió con una orden registrada a otro proveedor no se puede pedir de nuevo.
      const conflictos = await conflictosPorOrigen(this.sql, String(ppto.IdPresupuesto), tx);
      if (conflictos.length > 0) {
        const lista = conflictos.slice(0, 5).map((c) => `${c.codigo} (${c.documentos.join(', ')})`).join('; ');
        bloqueos.push({
          codigo: 'COMPROMISO_EN_CONFLICTO',
          mensaje: `${conflictos.length} ítem(s) ya tienen una orden registrada con otro proveedor: ${lista}${conflictos.length > 5 ? '…' : ''}. Anule la orden anterior o vuelva a adjudicar al mismo proveedor`,
        });
      }
    }
    return { tipo, bloqueos, predecesor };
  }
}

function resumir(arbol: readonly FasePresupuesto[]) {
  let categorias = 0;
  let items = 0;
  let costo = 0;
  for (const f of arbol) {
    categorias += f.categorias.length;
    if (f.categorias.length === 0) costo += f.costoDirecto;
    for (const c of f.categorias) {
      items += c.items.length;
      costo += suma(c.items.map((i) => redondear2(i.cantidad * i.costoUnitario)));
    }
  }
  return { fases: arbol.length, categorias, items, costo_directo: redondear2(costo).toFixed(2) };
}

/** Código `PPTO-{año}-{correlativo de 3 dígitos}` (el mismo formato que el alta manual), leído dentro de la transacción. */
async function siguienteCodigo(orm: Orm): Promise<string> {
  const prefijo = `PPTO-${new Date().getFullYear()}-`;
  const filas = await orm.ppto_Principal.where((p) => p.IdPresupuesto.ilike(`${prefijo}%`)).all();
  let max = 0;
  for (const fila of filas) {
    const n = Number.parseInt((fila.IdPresupuesto ?? '').split('-').at(-1) ?? '', 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return `${prefijo}${String(max + 1).padStart(3, '0')}`;
}
