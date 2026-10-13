import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { toDecimalString, toVarchar } from '../../presupuestos/presupuestos.helpers.js';
import { assertCentroCosto, compact, etiquetaSemana, readDateOnly, toDateOnly } from '../shared/obra-shared.js';
import type { CreateLoteSemanasDto, CreateObraSemanaDto, ObraSemanaDto, UpdateAvanceSemanalDto, UpdateObraSemanaDto } from './cronograma.dto.js';

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

  async create(idCentroCosto: number, dto: CreateObraSemanaDto): Promise<ObraSemanaDto> {
    await assertCentroCosto(this.db, idCentroCosto);
    const existentes = await this.list(idCentroCosto);
    const numero = dto.numero_semana ?? existentes.reduce((max, s) => Math.max(max, s.numero_semana), 0) + 1;
    if (existentes.some((s) => s.numero_semana === numero)) {
      throw new ConflictException(`La semana ${numero} ya existe en este centro de costo`);
    }
    this.assertRangoFechas(dto.fecha_inicio, dto.fecha_fin);

    const row = await this.db.orm.public.obra_semanas_cronograma.create({
      id_centro_costo: idCentroCosto,
      numero_semana: numero,
      etiqueta_semana: toVarchar<50>(dto.etiqueta_semana?.trim() || etiquetaSemana(numero)),
      fecha_inicio: toDateOnly(dto.fecha_inicio)!,
      fecha_fin: toDateOnly(dto.fecha_fin)!,
      fase_principal: toVarchar<255>(dto.fase_principal.trim()),
      descripcion_actividades: toVarchar<1000>(dto.descripcion_actividades),
      responsable_nombre: toVarchar<150>(dto.responsable_nombre),
      porcentaje_meta: toDecimalString(dto.porcentaje_meta ?? 0),
      porcentaje_real: toDecimalString(dto.porcentaje_real ?? 0),
      estado: toVarchar<50>(dto.estado ?? 'Programado'),
      orden: numero,
    });
    return mapSemana(row);
  }

  async update(idCentroCosto: number, idSemana: number, dto: UpdateObraSemanaDto): Promise<ObraSemanaDto> {
    const actual = await this.findOrFail(idCentroCosto, idSemana);
    this.assertRangoFechas(dto.fecha_inicio ?? readDateOnly(actual.fecha_inicio), dto.fecha_fin ?? readDateOnly(actual.fecha_fin));

    const row = await this.db.orm.public.obra_semanas_cronograma.where({ id: idSemana }).update(
      compact({
        etiqueta_semana: toVarchar<50>(dto.etiqueta_semana),
        fecha_inicio: toDateOnly(dto.fecha_inicio),
        fecha_fin: toDateOnly(dto.fecha_fin),
        fase_principal: toVarchar<255>(dto.fase_principal),
        descripcion_actividades: toVarchar<1000>(dto.descripcion_actividades),
        responsable_nombre: toVarchar<150>(dto.responsable_nombre),
        porcentaje_meta: toDecimalString(dto.porcentaje_meta),
        porcentaje_real: toDecimalString(dto.porcentaje_real),
        estado: toVarchar<50>(dto.estado),
      }),
    );
    if (!row) throw new NotFoundException(`Semana ${idSemana} no encontrada`);
    return mapSemana(row);
  }

  async updateAvance(idCentroCosto: number, idSemana: number, dto: UpdateAvanceSemanalDto): Promise<ObraSemanaDto> {
    return this.update(idCentroCosto, idSemana, { porcentaje_real: dto.porcentaje_real, estado: dto.estado });
  }

  async createLote(idCentroCosto: number, dto: CreateLoteSemanasDto): Promise<ObraSemanaDto[]> {
    await assertCentroCosto(this.db, idCentroCosto);
    if (!dto.semanas || dto.semanas.length === 0) {
      throw new BadRequestException('El lote de semanas no puede estar vacío');
    }

    if (dto.reemplazar_existentes) {
      await this.db.orm.public.obra_semanas_cronograma.where({ id_centro_costo: idCentroCosto }).delete();
    }

    const existentes = await this.list(idCentroCosto);
    let siguienteNumero = existentes.reduce((max, s) => Math.max(max, s.numero_semana), 0) + 1;

    for (const semDto of dto.semanas) {
      const numero = semDto.numero_semana ?? siguienteNumero++;
      this.assertRangoFechas(semDto.fecha_inicio, semDto.fecha_fin);
      await this.db.orm.public.obra_semanas_cronograma.create({
        id_centro_costo: idCentroCosto,
        numero_semana: numero,
        etiqueta_semana: toVarchar<50>(semDto.etiqueta_semana?.trim() || etiquetaSemana(numero)),
        fecha_inicio: toDateOnly(semDto.fecha_inicio)!,
        fecha_fin: toDateOnly(semDto.fecha_fin)!,
        fase_principal: toVarchar<255>(semDto.fase_principal.trim()),
        descripcion_actividades: toVarchar<1000>(semDto.descripcion_actividades),
        responsable_nombre: toVarchar<150>(semDto.responsable_nombre),
        porcentaje_meta: toDecimalString(semDto.porcentaje_meta ?? 0),
        porcentaje_real: toDecimalString(semDto.porcentaje_real ?? 0),
        estado: toVarchar<50>(semDto.estado ?? 'Programado'),
        orden: numero,
      });
    }

    return this.list(idCentroCosto);
  }

  async remove(idCentroCosto: number, idSemana: number) {
    await this.findOrFail(idCentroCosto, idSemana);
    await this.db.orm.public.obra_semanas_cronograma.where({ id: idSemana }).delete();
    return { deleted: true, id: idSemana };
  }

  private async findOrFail(idCentroCosto: number, idSemana: number) {
    const semana = await this.db.orm.public.obra_semanas_cronograma.first({ id: idSemana, id_centro_costo: idCentroCosto });
    if (!semana) throw new NotFoundException(`Semana ${idSemana} no encontrada para CC ${idCentroCosto}`);
    return semana;
  }

  private assertRangoFechas(inicio: string, fin: string) {
    if (inicio && fin && inicio.slice(0, 10) > fin.slice(0, 10)) {
      throw new BadRequestException('La fecha de inicio no puede ser posterior a la fecha de fin');
    }
  }
}
