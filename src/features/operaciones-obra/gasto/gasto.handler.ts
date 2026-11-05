import { Inject, Injectable } from '@nestjs/common';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { AlmacenSql } from '../../almacen/shared/almacen-sql.js';
import { cargarGastoObra, type GastoObra } from '../shared/gasto-subfase.js';
import { assertCentroCosto } from '../shared/obra-shared.js';

@Injectable()
export class GastoHandler {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sql: AlmacenSql,
  ) {}

  /** Gasto de la obra por subfase frente al presupuesto Meta (se calcula al leer; nada se guarda). */
  async obtener(idCentroCosto: number): Promise<GastoObra> {
    await assertCentroCosto(this.db, idCentroCosto);
    return cargarGastoObra(this.sql, idCentroCosto);
  }
}
