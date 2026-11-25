import { Injectable, NotFoundException } from '@nestjs/common';
import { AlmacenSql, I, T, TN, sqlTag } from '../../almacen/shared/almacen-sql.js';
import { hoyLima } from '../../operaciones-obra/shared/obra-shared.js';
import { preciosOferta } from '../../requerimientos/shared/precios-oferta.js';
import { claveMoneda, tcVigente } from '../../tesoreria/shared/tipo-cambio.js';
import { esSoles } from '../../tesoreria/shared/tributos.js';
import { leerPresupuesto, type PresupuestoBloqueado } from '../cotizaciones-ppto/contexto-ppto.js';
import { armarAdjudicado, type FilaAdjudicado } from './adjudicado.js';

@Injectable()
export class AdjudicadoHandler {
  constructor(private readonly sql: AlmacenSql) {}

  /** El presupuesto por su id numérico o por su código `IdPresupuesto` (el dosier trabaja con códigos). */
  private async resolver(idOrCode: string): Promise<PresupuestoBloqueado> {
    if (/^\d+$/.test(idOrCode)) return leerPresupuesto(this.sql, Number(idOrCode));
    const q = sqlTag(this.sql);
    const [p] = await q.rows<{ id: number }>({ id: I })`SELECT id FROM "ppto_Principal" WHERE "IdPresupuesto" = ${idOrCode}::text ORDER BY id LIMIT 1`;
    if (!p) throw new NotFoundException(`Presupuesto ${idOrCode} no encontrado`);
    return leerPresupuesto(this.sql, p.id);
  }

  /** Árbol fase → subfase → ítem con el Meta y lo adjudicado, en soles y sin IGV (R-01). */
  async obtener(idOrCode: string) {
    const ppto = await this.resolver(idOrCode);
    const q = sqlTag(this.sql);
    const filas = await q.rows<Record<string, string | number | boolean | null>>(
      {
        id_fase: I, fase: T, id_subfase: I, subfase: T, id_item: I, codigo: T, descripcion: T, unidad: TN, cantidad: T, pu_meta: T, proveedor: TN,
        precio: TN, moneda_id: TN, simbolo: TN, incluye_igv: { codecId: 'pg/bool@1', nullable: true }, afecto_igv: { codecId: 'pg/bool@1', nullable: true }, fecha: TN,
      },
    )`
      SELECT COALESCE(m.id, df.id) AS id_fase, COALESCE(m."FaseProyecto", df."IdpptoFase", 'Fase #' || df.id::text)::text AS fase,
             c.id AS id_subfase,
             COALESCE((SELECT fc."Descripcion" FROM "ppto_FasesCategorias" fc WHERE fc."IdpptoFaseCategoria" = c."IdpptoFaseCategoria" LIMIT 1),
                      'Subfase #' || c.id::text)::text AS subfase,
             i.id AS id_item, p.codigo::text AS codigo, p.descripcion::text AS descripcion, COALESCE(u.simbolo, u.codigo)::text AS unidad,
             i."Cantidad"::text AS cantidad, COALESCE(i."CostoUnitarioMeta", i."CostoUnitario", 0)::text AS pu_meta,
             COALESCE(a."NombreComercial", a."Anexo")::text AS proveedor,
             g.precio_unitario::text AS precio, q.moneda_id::text AS moneda_id, q.moneda_simbolo::text AS simbolo, q.incluye_igv, q.afecto_igv, q.fecha::text AS fecha
        FROM "ppto_DetalleItems" i
        JOIN "ppto_DetalleFasesCate" c ON c.id = i.id_detalle_categoria
        JOIN "ppto_DetalleFases" df ON df."IdPresupuestoDetalle" = c."IdPresupuestoDetalle"
        LEFT JOIN "ppto_Fases" m ON m."IdpptoFase" = df."IdpptoFase"
        JOIN producto p ON p.id = i.id_producto
        LEFT JOIN unidad_medida u ON u.id = i.id_unidad_medida
        LEFT JOIN ppto_cotizacion_detalle g ON g.id = i.id_ppto_cot_detalle_ganadora
        LEFT JOIN ppto_cotizacion q ON q.id = g.id_cotizacion
        LEFT JOIN anexos a ON a.id = q.id_proveedor
       WHERE i."IdPresupuesto" = ${ppto.codigo}::text AND df."IdPresupuesto" = ${ppto.codigo}::text AND COALESCE(i."Cantidad", 0) > 0
       ORDER BY df.id, c.id, i."Orden", i.id`;

    const entrada: FilaAdjudicado[] = [];
    for (const f of filas) {
      let puAdj: number | null = null;
      let sinTc = false;
      if (f['precio'] !== null && f['moneda_id'] !== null) {
        const sin = preciosOferta(Number(f['precio']), (f['incluye_igv'] as boolean | null) ?? false, (f['afecto_igv'] as boolean | null) ?? true).sin;
        if (esSoles(f['moneda_id'] as string, f['simbolo'] as string | null)) {
          puAdj = sin;
        } else {
          const tc = await tcVigente(this.sql, claveMoneda(f['moneda_id'] as string, f['simbolo'] as string | null), (f['fecha'] as string | null) ?? hoyLima());
          if (tc) puAdj = sin * Number(tc.venta);
          else sinTc = true;
        }
      }
      entrada.push({
        id_fase: f['id_fase'] as number,
        fase: f['fase'] as string,
        id_subfase: f['id_subfase'] as number,
        subfase: f['subfase'] as string,
        id_item: f['id_item'] as number,
        codigo: f['codigo'] as string,
        descripcion: f['descripcion'] as string,
        unidad: f['unidad'] as string | null,
        cantidad: Number(f['cantidad']),
        pu_meta: Number(f['pu_meta']),
        proveedor: f['proveedor'] as string | null,
        pu_adjudicado: puAdj,
        sin_tipo_cambio: sinTc,
      });
    }
    return { id: ppto.id, id_presupuesto: ppto.codigo, estado_ppto: ppto.estado, id_centro_costo: ppto.id_centro_costo, ...armarAdjudicado(entrada) };
  }
}

