import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import type { PeriodoFiscalDto } from './periodo-fiscal.dto.js';

export const ANIO_MIN = 2000;
export const ANIO_MAX = 2100;

/** Años que se pueden elegir como periodo de un centro de costo o un presupuesto (GRP S-11). */
@Injectable()
export class PeriodoFiscalHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(soloActivos = false): Promise<PeriodoFiscalDto[]> {
    const orm = this.db.orm.public;
    const filas = await (soloActivos ? orm.periodo_fiscal.where({ activo: true }) : orm.periodo_fiscal).all();
    return filas.map((f) => ({ anio: f.anio, activo: f.activo })).sort((a, b) => a.anio - b.anio);
  }

  /** Crea el año si no existe o cambia si está activo. */
  async set(anio: number, activo: boolean): Promise<PeriodoFiscalDto> {
    if (!Number.isInteger(anio) || anio < ANIO_MIN || anio > ANIO_MAX) {
      throw new BadRequestException(`El año debe estar entre ${ANIO_MIN} y ${ANIO_MAX}`);
    }
    const orm = this.db.orm.public;
    const actual = await orm.periodo_fiscal.first({ anio });
    if (actual) await orm.periodo_fiscal.where({ anio }).update({ activo });
    else await orm.periodo_fiscal.create({ anio, activo });
    return { anio, activo };
  }
}
