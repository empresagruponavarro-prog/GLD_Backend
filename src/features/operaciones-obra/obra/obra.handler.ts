import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Varchar } from '@prisma/orm-postgres/target/codec-types';
import { nowInstant } from '../../../platform/db/temporal.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import type {
  ObraCockpitDto,
  ObraDatosGeneralesDto,
  ObraKpiDto,
  ObraPlanoDto,
  ObraResidenteDto,
  ObraSemanaDto,
  UpdateAvanceSemanalDto,
  UpdateObraDatosGeneralesDto,
  CreateObraResidenteDto,
} from './obra.dto.js';

function toVarchar<N extends number = 255>(value: string | undefined): Varchar<N> | undefined;
function toVarchar<N extends number = 255>(value: string | null | undefined): Varchar<N> | null | undefined;
function toVarchar<N extends number = 255>(value: string | null | undefined): Varchar<N> | null | undefined {
  return value as unknown as Varchar<N>;
}

@Injectable()
export class ObraHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Carga consolidada del Cockpit de Datos de Obra */
  async getCockpit(idCentroCosto: number): Promise<ObraCockpitDto> {
    const cc = await this.db.orm.public.CentroCostos.first({ id: idCentroCosto });
    if (!cc) throw new NotFoundException(`Centro de Costo ${idCentroCosto} no encontrado`);

    const [generalesRow, residentesRows, semanasRows, planosRows] = await Promise.all([
      this.db.orm.public.obra_datos_generales.first({ id_centro_costo: idCentroCosto }),
      this.db.orm.public.obra_residentes
        .where({ id_centro_costo: idCentroCosto })
        .orderBy((r) => r.orden.asc())
        .all(),
      this.db.orm.public.obra_semanas_cronograma
        .where({ id_centro_costo: idCentroCosto })
        .orderBy((s) => s.orden.asc())
        .all(),
      this.db.orm.public.obra_planos
        .where({ id_centro_costo: idCentroCosto, es_vigente: true })
        .all(),
    ]);

    const generales = generalesRow ? this.mapGenerales(generalesRow) : undefined;
    const residentes: ObraResidenteDto[] = residentesRows.map((r) => ({
      id: r.id,
      nombre_completo: r.nombre_completo ?? '',
      rol_obra: r.rol_obra ?? '',
      cip_cap: r.cip_cap ?? undefined,
      especialidad: r.especialidad ?? undefined,
      telefono: r.telefono ?? undefined,
      correo: r.correo ?? undefined,
      turno: r.turno ?? undefined,
      estado_planta: r.estado_planta ?? 'En Planta',
      foto_url: r.foto_url ?? undefined,
      whatsapp_url: r.telefono ? `https://wa.me/${r.telefono.replace(/[^0-9]/g, '')}` : undefined,
    }));

    const cronograma: ObraSemanaDto[] = semanasRows.map((s) => ({
      id: s.id,
      numero_semana: s.numero_semana,
      etiqueta_semana: s.etiqueta_semana ?? `SEM ${s.numero_semana.toString().padStart(2, '0')}`,
      fecha_inicio: s.fecha_inicio?.toString() ?? '',
      fecha_fin: s.fecha_fin?.toString() ?? '',
      fase_principal: s.fase_principal ?? '',
      responsable_nombre: s.responsable_nombre ?? undefined,
      porcentaje_meta: Number(s.porcentaje_meta ?? 0),
      porcentaje_real: Number(s.porcentaje_real ?? 0),
      estado: s.estado ?? 'Programado',
    }));

    const planos: ObraPlanoDto[] = planosRows.map((p) => ({
      id: p.id,
      codigo_plano: p.codigo_plano ?? '',
      nombre_plano: p.nombre_plano ?? '',
      disciplina: p.disciplina ?? '',
      version: p.version ?? 'v1.0',
      es_vigente: p.es_vigente ?? true,
      estado_aprobacion: p.estado_aprobacion ?? 'Aprobado Obra',
      formato_peso: p.formato_peso ?? undefined,
      archivo_url: p.archivo_url ?? undefined,
      emitido_por: p.emitido_por ?? undefined,
    }));

    const kpis = this.calcularKpis(cronograma, generalesRow);

    return {
      id_centro_costo: idCentroCosto,
      nombre_obra: cc.centro_costo ?? `Obra #${idCentroCosto}`,
      generales,
      kpis,
      cronograma,
      residentes,
      planos,
    };
  }

  /** Actualiza la ficha técnica general de la obra */
  async updateGenerales(idCentroCosto: number, dto: UpdateObraDatosGeneralesDto) {
    const existing = await this.db.orm.public.obra_datos_generales.first({ id_centro_costo: idCentroCosto });

    const payload = {
      expediente_codigo: toVarchar<100>(dto.expediente_codigo),
      direccion: toVarchar<1000>(dto.direccion),
      departamento: toVarchar<100>(dto.departamento),
      provincia: toVarchar<100>(dto.provincia),
      distrito: toVarchar<100>(dto.distrito),
      ubigeo_cod: toVarchar<10>(dto.ubigeo_cod),
      latitud: dto.latitud != null ? String(dto.latitud) : undefined,
      longitud: dto.longitud != null ? String(dto.longitud) : undefined,
      semanas_totales: dto.semanas_totales,
      personal_activo_promedio: dto.personal_activo_promedio,
      turno_trabajo: toVarchar<50>(dto.turno_trabajo),
      contacto_cliente_nombre: toVarchar<150>(dto.contacto_cliente_nombre),
      contacto_cliente_telefono: toVarchar<50>(dto.contacto_cliente_telefono),
      contacto_cliente_correo: toVarchar<150>(dto.contacto_cliente_correo),
    };

    if (!existing) {
      const created = await this.db.orm.public.obra_datos_generales.create({
        id_centro_costo: idCentroCosto,
        ...payload,
      });
      return this.mapGenerales(created);
    }

    const updated = await this.db.orm.public.obra_datos_generales
      .where({ id: existing.id })
      .update({
        ...payload,
        updated_at: nowInstant(),
      });
    return this.mapGenerales(updated);
  }

  /** Actualiza el avance real de una semana y recalcula el avance global */
  async updateAvanceSemanal(idCentroCosto: number, idSemana: number, dto: UpdateAvanceSemanalDto) {
    const semana = await this.db.orm.public.obra_semanas_cronograma.first({ id: idSemana, id_centro_costo: idCentroCosto });
    if (!semana) throw new NotFoundException(`Semana ${idSemana} no encontrada para CC ${idCentroCosto}`);

    await this.db.orm.public.obra_semanas_cronograma
      .where({ id: idSemana })
      .update({
        porcentaje_real: String(dto.porcentaje_real),
        estado: toVarchar<50>(dto.estado ?? semana.estado ?? undefined),
      });

    return this.getCockpit(idCentroCosto);
  }

  /** Crea un nuevo residente asignado a la obra */
  async createResidente(idCentroCosto: number, dto: CreateObraResidenteDto) {
    const cc = await this.db.orm.public.CentroCostos.first({ id: idCentroCosto });
    if (!cc) throw new NotFoundException(`Centro de Costo ${idCentroCosto} no encontrado`);

    return this.db.orm.public.obra_residentes.create({
      id_centro_costo: idCentroCosto,
      id_anexo: dto.id_anexo,
      nombre_completo: toVarchar<200>(dto.nombre_completo)!,
      rol_obra: toVarchar<100>(dto.rol_obra)!,
      cip_cap: toVarchar<50>(dto.cip_cap),
      especialidad: toVarchar<150>(dto.especialidad),
      telefono: toVarchar<50>(dto.telefono),
      correo: toVarchar<150>(dto.correo),
      turno: toVarchar<100>(dto.turno),
      estado_planta: toVarchar<50>(dto.estado_planta),
      orden: dto.orden,
    });
  }

  /** Elimina un residente de la obra */
  async deleteResidente(idResidente: number) {
    await this.db.orm.public.obra_residentes.where({ id: idResidente }).delete();
    return { deleted: true, id: idResidente };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  private mapGenerales(row: any): ObraDatosGeneralesDto {
    const lat = row.latitud ? Number(row.latitud) : undefined;
    const lng = row.longitud ? Number(row.longitud) : undefined;
    return {
      id: row.id,
      expediente_codigo: row.expediente_codigo ?? undefined,
      direccion: row.direccion ?? undefined,
      departamento: row.departamento ?? undefined,
      provincia: row.provincia ?? undefined,
      distrito: row.distrito ?? undefined,
      ubigeo_cod: row.ubigeo_cod ?? undefined,
      latitud: lat,
      longitud: lng,
      google_maps_url: lat && lng ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : undefined,
      waze_url: lat && lng ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes` : undefined,
      semanas_totales: row.semanas_totales ?? undefined,
      personal_activo_promedio: row.personal_activo_promedio ?? undefined,
      turno_trabajo: row.turno_trabajo ?? undefined,
      contacto_cliente_nombre: row.contacto_cliente_nombre ?? undefined,
      contacto_cliente_telefono: row.contacto_cliente_telefono ?? undefined,
      contacto_cliente_correo: row.contacto_cliente_correo ?? undefined,
    };
  }

  private calcularKpis(cronograma: ObraSemanaDto[], generalesRow: any): ObraKpiDto {
    const totalSemanas = cronograma.length || 1;
    const avanceMeta = cronograma.reduce((acc, s) => acc + s.porcentaje_meta, 0) / totalSemanas;
    const avanceReal = cronograma.reduce((acc, s) => acc + s.porcentaje_real, 0) / totalSemanas;
    const semanaActiva = cronograma.find((s) => s.estado === 'En Plazo' || s.estado === 'Retrasado')?.numero_semana ?? 0;
    return {
      avance_real_global: Math.round(avanceReal * 100) / 100,
      avance_meta_global: Math.round(avanceMeta * 100) / 100,
      desviacion: Math.round((avanceReal - avanceMeta) * 100) / 100,
      semana_activa: semanaActiva,
      semanas_totales: totalSemanas,
      personal_activo: generalesRow?.personal_activo_promedio ?? 0,
    };
  }
}
