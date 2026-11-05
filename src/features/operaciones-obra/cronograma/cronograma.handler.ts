import { Inject, Injectable } from '@nestjs/common';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { etiquetaSemana, readDateOnly } from '../shared/obra-shared.js';
import type { ObraSemanaDto } from './cronograma.dto.js';

type SemanaRow = NonNullable<Awaited<ReturnType<Database['orm']['public']['obra_semanas_cronograma']['first']>>>;

export function mapSemana(s: SemanaRow): ObraSemanaDto {
  return {
    id: s.id,
    numero_semana: s.numero_semana,
    etiqueta_semana: s.etiqueta_semana || etiquetaSemana(s.numero_semana),
    fecha_inicio: readDateOnly(s.fecha_inicio),
    fecha_fin: readDateOnly(s.fecha_fin),
    fase_principal: s.fase_principal ?? '',
    descripcion_actividades: s.descripcion_actividades ?? undefined,
    responsable_nombre: s.responsable_nombre ?? undefined,
    porcentaje_meta: Number(s.porcentaje_meta ?? 0),
    porcentaje_real: Number(s.porcentaje_real ?? 0),
    estado: s.estado ?? 'Programado',
    orden: s.orden ?? s.numero_semana,
  };
}

/**
 * Cronograma semanal de la obra: bitácora histórica de **solo lectura** (GRP S-01, SP-02). El avance sale de las partidas y
 * subpartidas (control de avance); las semanas ya guardadas se conservan para consulta.
 */
@Injectable()
export class CronogramaHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(idCentroCosto: number): Promise<ObraSemanaDto[]> {
    const rows = await this.db.orm.public.obra_semanas_cronograma
      .where({ id_centro_costo: idCentroCosto })
      .orderBy((s) => s.numero_semana.asc())
      .all();
    return rows.map(mapSemana);
  }
}
