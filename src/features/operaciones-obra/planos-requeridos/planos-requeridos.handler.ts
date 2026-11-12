import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { nowInstant } from '../../../platform/db/temporal.js';
import { toVarchar } from '../../../platform/db/varchar-helpers.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { assertCentroCosto } from '../shared/obra-shared.js';
import type { PlanosRequeridosObraDto } from './planos-requeridos.dto.js';
import { cargarPlanosRequeridos, resumenPlanos } from './planos-requeridos.js';

@Injectable()
export class PlanosRequeridosHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async listar(idCentroCosto: number): Promise<PlanosRequeridosObraDto> {
    const cc = await assertCentroCosto(this.db, idCentroCosto);
    const orm = this.db.orm.public;
    const items = await cargarPlanosRequeridos(orm, idCentroCosto);
    const tipo = cc.id_tipo_proyecto != null ? await orm.tipo_proyecto.first({ id: cc.id_tipo_proyecto }) : null;
    return {
      id_centro_costo: idCentroCosto,
      id_tipo_proyecto: cc.id_tipo_proyecto ?? null,
      tipo_proyecto: tipo?.nombre ?? null,
      items,
      resumen: resumenPlanos(items),
    };
  }

  /**
   * Marca o desmarca un plano de la lista de la obra (con quién y cuándo). Marcarlo exige que el plano ya tenga archivo:
   * un plano vigente de la obra con el mismo código y con archivo o enlace (se guarda en `id_plano`).
   */
  async marcar(idCentroCosto: number, idTipoPlano: number, entregado: boolean, usuario: string | undefined): Promise<PlanosRequeridosObraDto> {
    await assertCentroCosto(this.db, idCentroCosto);
    const orm = this.db.orm.public;
    const fila = await orm.obra_plano_requerido.first({ id_centro_costo: idCentroCosto, id_tipo_plano: idTipoPlano });
    if (!fila) throw new NotFoundException(`El tipo de plano ${idTipoPlano} no está en la lista de verificación de esta obra`);
    if (entregado) {
      const item = (await cargarPlanosRequeridos(orm, idCentroCosto)).find((i) => i.id_tipo_plano === idTipoPlano);
      if (!item?.archivo) {
        throw new BadRequestException(`Sube primero el archivo del plano ${item?.codigo ?? idTipoPlano} para marcarlo como entregado`);
      }
      await orm.obra_plano_requerido.where({ id: fila.id }).update({
        entregado: true,
        entregado_por: toVarchar<255>(usuario ?? 'SISTEMA'),
        entregado_en: nowInstant(),
        id_plano: item.archivo.id_plano,
      });
    } else {
      await orm.obra_plano_requerido.where({ id: fila.id }).update({ entregado: false, entregado_por: null, entregado_en: null });
    }
    return this.listar(idCentroCosto);
  }
}
