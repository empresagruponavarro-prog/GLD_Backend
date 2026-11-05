import { Injectable } from '@nestjs/common';
import { AlmacenSql, I, T, sqlTag } from '../../almacen/shared/almacen-sql.js';
import { centroTienePrincipalAprobado } from '../shared/subfase-presupuesto.js';
import type { SubfasesCentroCostoDto } from './subfases.dto.js';

@Injectable()
export class SubfasesHandler {
  constructor(private readonly sql: AlmacenSql) {}

  /**
   * Subfases (categorías) de los presupuestos aprobados de una obra, para elegirlas en un FUR, una OC directa o una salida.
   * `requerida` dice si la obra tiene un Principal aprobado (con él, la salida CONSUMO debe indicar la subfase).
   */
  async listar(idCentroCosto: number): Promise<SubfasesCentroCostoDto> {
    const q = sqlTag(this.sql);
    const subfases = await q.rows<{ id: number; subfase: string; fase: string; presupuesto: string }>({ id: I, subfase: T, fase: T, presupuesto: T })`
      SELECT c.id, COALESCE(fc."Descripcion", 'Subfase #' || c.id)::text AS subfase,
             COALESCE(f."FaseProyecto", c."IdpptoFase", '')::text AS fase, p."IdPresupuesto"::text AS presupuesto
        FROM "ppto_DetalleFasesCate" c
        JOIN "ppto_Principal" p ON p."IdPresupuesto" = c."IdPresupuesto"
        LEFT JOIN "ppto_FasesCategorias" fc ON fc."IdpptoFaseCategoria" = c."IdpptoFaseCategoria"
        LEFT JOIN "ppto_Fases" f ON f."IdpptoFase" = c."IdpptoFase"
       WHERE p.id_centro_costo = ${idCentroCosto}::int AND p.estado_ppto::text IN ('APROBADO', 'ENTREGADO', 'LIQUIDADO')
       ORDER BY p.id, c.id`;
    return { id_centro_costo: idCentroCosto, requerida: await centroTienePrincipalAprobado(this.sql, undefined, idCentroCosto), subfases };
  }
}
