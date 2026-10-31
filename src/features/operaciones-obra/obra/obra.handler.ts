import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { nowInstant } from '../../../platform/db/temporal.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { toVarchar } from '../../../platform/db/varchar-helpers.js';
import { mapSemana } from '../cronograma/cronograma.handler.js';
import type { ObraSemanaDto } from '../cronograma/cronograma.dto.js';
import { mapDocumento } from '../documentos/documentos.handler.js';
import { mapIncidencia } from '../incidencias/incidencias.handler.js';
import type { ObraIncidenciaDto } from '../incidencias/incidencias.dto.js';
import { mapPlano } from '../planos/planos.handler.js';
import { mapResidente } from '../residentes/residentes.handler.js';
import { truncar } from '../shared/control-avance/avance.js';
import { cargarObra } from '../shared/control-avance/carga-obra.js';
import { cargarEquipo, validarEquipo, ROLES_EQUIPO, type EquipoObra } from '../shared/control-avance/equipo.js';
import { calcularObra } from '../shared/control-avance/motor.js';
import { registrarEvento } from '../shared/control-avance/registrar-evento.js';
import { assertCentroCosto, compact, esFechaIso, hoyLima, readDateOnly, toDateOnly } from '../shared/obra-shared.js';
import type {
  ObraCabeceraDto,
  ObraCockpitDto,
  ObraDatosGeneralesDto,
  ObraKpiDto,
  UpdateObraDatosGeneralesDto,
} from './obra.dto.js';

type GeneralesRow = NonNullable<Awaited<ReturnType<Database['orm']['public']['obra_datos_generales']['first']>>>;

const MS_DIA = 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function mapGenerales(row: GeneralesRow, equipo?: EquipoObra): ObraDatosGeneralesDto {
  const lat = row.latitud != null ? Number(row.latitud) : undefined;
  const lng = row.longitud != null ? Number(row.longitud) : undefined;
  const hasCoords = lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng);
  return {
    id: row.id,
    expediente_codigo: row.expediente_codigo ?? undefined,
    direccion: row.direccion ?? undefined,
    departamento: row.departamento ?? undefined,
    provincia: row.provincia ?? undefined,
    distrito: row.distrito ?? undefined,
    ubigeo_cod: row.ubigeo_cod ?? undefined,
    latitud: hasCoords ? lat : undefined,
    longitud: hasCoords ? lng : undefined,
    google_maps_url: hasCoords ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : undefined,
    waze_url: hasCoords ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes` : undefined,
    semanas_totales: row.semanas_totales ?? undefined,
    personal_activo_promedio: row.personal_activo_promedio ?? undefined,
    turno_trabajo: row.turno_trabajo ?? undefined,
    contacto_cliente_nombre: row.contacto_cliente_nombre ?? undefined,
    contacto_cliente_telefono: row.contacto_cliente_telefono ?? undefined,
    contacto_cliente_correo: row.contacto_cliente_correo ?? undefined,
    codigo_obra: row.codigo_obra ?? undefined,
    tienda: row.tienda ?? undefined,
    estado_obra: row.estado_obra ?? undefined,
    comentario: row.comentario ?? undefined,
    avance_general: row.avance_general != null ? Number(row.avance_general) : undefined,
    fecha_cierre_postventa: row.fecha_cierre_postventa ? readDateOnly(row.fecha_cierre_postventa) : undefined,
    plazo_postventa_dias: row.plazo_postventa_dias ?? undefined,
    observaciones_postventa: row.observaciones_postventa ?? undefined,
    id_presupuesto_origen: row.id_presupuesto_origen ?? undefined,
    equipo,
  };
}

/**
 * KPIs de la obra. Los porcentajes de cada semana se interpretan como **acumulados** (Curva S):
 * - meta global = % programado de la semana en curso (por fechas).
 * - real global = % real de la última semana con avance reportado.
 *
 * `hoyIso` es la fecha de Lima (el default ya no es UTC: desde las 19:00 de Lima UTC es el día siguiente).
 */
export function calcularKpis(
  cronograma: ObraSemanaDto[],
  incidencias: ObraIncidenciaDto[],
  generales: ObraDatosGeneralesDto | undefined,
  cabecera: ObraCabeceraDto,
  hoyIso: string = hoyLima(),
): ObraKpiDto {
  const semanas = [...cronograma].sort((a, b) => a.numero_semana - b.numero_semana);

  let semanaActual: ObraSemanaDto | undefined = semanas.find((s) => s.fecha_inicio <= hoyIso && hoyIso <= s.fecha_fin);
  if (!semanaActual && semanas.length > 0) {
    const ultima = semanas[semanas.length - 1];
    if (ultima.fecha_fin && hoyIso > ultima.fecha_fin) semanaActual = ultima;
    else semanaActual = [...semanas].reverse().find((s) => s.fecha_fin && s.fecha_fin < hoyIso);
  }

  const conAvance = semanas.filter((s) => s.porcentaje_real > 0);
  const avanceReal = conAvance.length ? conAvance[conAvance.length - 1].porcentaje_real : 0;
  const avanceMeta = semanaActual?.porcentaje_meta ?? 0;

  const inicio = cabecera.fecha_inicio || semanas[0]?.fecha_inicio || '';
  const fin = cabecera.fecha_fin_prog || semanas[semanas.length - 1]?.fecha_fin || '';
  const diasTotales = inicio && fin ? Math.max(0, Math.round((Date.parse(fin) - Date.parse(inicio)) / MS_DIA) + 1) : 0;
  const diasTranscurridos =
    inicio && hoyIso >= inicio ? Math.min(diasTotales, Math.round((Date.parse(hoyIso) - Date.parse(inicio)) / MS_DIA) + 1) : 0;

  return {
    avance_real_global: round2(avanceReal),
    avance_meta_global: round2(avanceMeta),
    desviacion: round2(avanceReal - avanceMeta),
    semana_activa: semanaActual?.numero_semana ?? 0,
    semanas_totales: Math.max(semanas.length, generales?.semanas_totales ?? 0),
    personal_activo: generales?.personal_activo_promedio ?? 0,
    dias_totales: diasTotales,
    dias_transcurridos: diasTranscurridos,
    semanas_retrasadas: semanas.filter((s) => s.estado === 'Retrasado').length,
    incidencias_pendientes: incidencias.filter((i) => i.estado !== 'RESUELTA').length,
  };
}

@Injectable()
export class ObraHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Carga consolidada del Cockpit de Datos de Obra */
  async getCockpit(idCentroCosto: number, hoy: string = hoyLima()): Promise<ObraCockpitDto> {
    const cc = await assertCentroCosto(this.db, idCentroCosto);
    const pub = this.db.orm.public;

    const [generalesRow, residentesRows, semanasRows, planosRows, documentosRows, incidenciasRows, cabecera, carga] =
      await Promise.all([
        pub.obra_datos_generales.first({ id_centro_costo: idCentroCosto }),
        pub.obra_residentes.where({ id_centro_costo: idCentroCosto }).orderBy((r) => r.orden.asc()).all(),
        pub.obra_semanas_cronograma.where({ id_centro_costo: idCentroCosto }).orderBy((s) => s.numero_semana.asc()).all(),
        pub.obra_planos.where({ id_centro_costo: idCentroCosto, es_vigente: true }).orderBy((p) => p.codigo_plano.asc()).all(),
        pub.obra_documentos_actas.where({ id_centro_costo: idCentroCosto }).orderBy((d) => d.id.desc()).all(),
        pub.obra_incidencias_rfi.where({ id_centro_costo: idCentroCosto }).orderBy((i) => i.id.desc()).all(),
        this.buildCabecera(cc),
        cargarObra(pub, idCentroCosto),
      ]);

    const generales = generalesRow ? mapGenerales(generalesRow, await cargarEquipo(pub, generalesRow)) : undefined;
    const cronograma = semanasRows.map(mapSemana);
    const incidencias = incidenciasRows.map(mapIncidencia);
    const kpis = calcularKpis(cronograma, incidencias, generales, cabecera, hoy);

    // Si la obra ya tiene partidas con control de avance, el avance sale del motor (por subpartida,
    // con corte y tolerancia), no de la bitácora semanal escrita a mano.
    if (carga.entrada && carga.entrada.partidas.some((p) => p.subpartidas.length > 0)) {
      const r = calcularObra(carga.entrada, hoy);
      kpis.avance_real_global = round2(truncar(r.real));
      kpis.avance_meta_global = round2(truncar(r.programado));
      kpis.desviacion = round2(r.desviacion);
      kpis.semana_activa = r.semana.actual;
    }

    return {
      id_centro_costo: idCentroCosto,
      nombre_obra: cc.centro_costo ?? `Obra #${idCentroCosto}`,
      cabecera,
      generales,
      kpis,
      cronograma,
      residentes: residentesRows.map(mapResidente),
      planos: planosRows.map(mapPlano),
      documentos: documentosRows.map(mapDocumento),
      incidencias,
    };
  }

  /** Crea o actualiza (upsert) la ficha técnica y operativa de la obra. */
  async updateGenerales(idCentroCosto: number, dto: UpdateObraDatosGeneralesDto, usuario: string | null = null): Promise<ObraDatosGeneralesDto> {
    const cc = await assertCentroCosto(this.db, idCentroCosto);
    const pub = this.db.orm.public;
    const existing = await pub.obra_datos_generales.first({ id_centro_costo: idCentroCosto });

    // Fechas de la obra (viven en CentroCostos, D12)
    const inicioActual = cc.fecha_inicio ? readDateOnly(cc.fecha_inicio) : null;
    const finActual = cc.fecha_fin_prog ? readDateOnly(cc.fecha_fin_prog) : null;
    for (const [campo, valor] of [['fecha_inicio', dto.fecha_inicio], ['fecha_fin_prog', dto.fecha_fin_prog]] as const) {
      if (valor !== undefined && !esFechaIso(valor)) throw new BadRequestException(`${campo} inválida: ${valor}`);
    }
    const inicio = dto.fecha_inicio ?? inicioActual;
    const fin = dto.fecha_fin_prog ?? finActual;
    if (inicio && fin && fin < inicio) throw new BadRequestException('El fin programado no puede ser anterior al inicio (RV-03)');
    const cambiaPlazo = (dto.fecha_inicio !== undefined && dto.fecha_inicio !== inicioActual) || (dto.fecha_fin_prog !== undefined && dto.fecha_fin_prog !== finActual);

    // Equipo (D15): solo Anexos de tipo Trabajador activos
    const equipoDto = {
      id_jefe_proyecto: dto.id_jefe_proyecto,
      id_coordinador: dto.id_coordinador,
      id_residente: dto.id_residente,
      id_resp_presupuesto: dto.id_resp_presupuesto,
      id_resp_procura: dto.id_resp_procura,
    };
    await validarEquipo(pub, equipoDto);
    const equipoAntes = existing ? await cargarEquipo(pub, existing) : null;
    const cambiaEquipo = ROLES_EQUIPO.some((rol) => equipoDto[`id_${rol}` as keyof typeof equipoDto] !== undefined);

    // Código de obra único
    const codigo = dto.codigo_obra?.trim().toUpperCase();
    if (codigo) {
      const otra = await pub.obra_datos_generales.first({ codigo_obra: toVarchar<30>(codigo) });
      if (otra && otra.id_centro_costo !== idCentroCosto) throw new ConflictException(`El código de obra ${codigo} ya lo usa otra obra`);
    }

    const payload = compact({
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
      codigo_obra: toVarchar<30>(codigo),
      tienda: toVarchar<80>(dto.tienda?.trim()),
      ...equipoDto,
      avance_general: dto.avance_general === undefined ? undefined : dto.avance_general === null ? null : String(Math.round(dto.avance_general * 10) / 10),
      comentario: dto.comentario === undefined ? undefined : toVarchar<200>(dto.comentario?.trim() || null),
      plazo_postventa_dias: dto.plazo_postventa_dias,
      observaciones_postventa: dto.observaciones_postventa === undefined ? undefined : toVarchar<200>(dto.observaciones_postventa?.trim() || null),
      actualizado_por: usuario ? toVarchar<255>(usuario) : undefined,
    });

    let row!: GeneralesRow;
    await this.db.transaction(async (tx) => {
      const t = tx.orm.public;
      if (cambiaPlazo) {
        await t.CentroCostos.where({ id: idCentroCosto }).update(
          compact({ fecha_inicio: toDateOnly(dto.fecha_inicio), fecha_fin_prog: toDateOnly(dto.fecha_fin_prog) }),
        );
      }
      if (!existing) {
        row = await t.obra_datos_generales.create({ id_centro_costo: idCentroCosto, ...payload });
      } else {
        const updated = await t.obra_datos_generales.where({ id: existing.id }).update({ ...payload, updated_at: nowInstant() });
        row = updated ?? existing;
      }

      if (cambiaPlazo) {
        await registrarEvento(t, {
          idCentroCosto,
          tipo: 'PLAZO',
          titulo: 'Plazo de la obra modificado',
          antes: `${inicioActual ?? '—'} → ${finActual ?? '—'}`,
          despues: `${inicio ?? '—'} → ${fin ?? '—'}`,
          usuario,
        });
      }
      if (cambiaEquipo) {
        const despues = await cargarEquipo(t, row);
        const cambios = ROLES_EQUIPO.filter((rol) => (equipoAntes?.[rol]?.id ?? null) !== (despues[rol]?.id ?? null)).map(
          (rol) => `${rol}: ${equipoAntes?.[rol]?.nombre ?? '—'} → ${despues[rol]?.nombre ?? '—'}`,
        );
        if (cambios.length > 0) await registrarEvento(t, { idCentroCosto, tipo: 'EQUIPO', titulo: 'Equipo de la obra actualizado', detalle: cambios.join(' · '), usuario });
      }
    });
    return mapGenerales(row, await cargarEquipo(pub, row));
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  private async buildCabecera(
    cc: NonNullable<Awaited<ReturnType<Database['orm']['public']['CentroCostos']['first']>>>,
  ): Promise<ObraCabeceraDto> {
    const pub = this.db.orm.public;
    let idEmpresa = cc.id_empresa ?? null;
    if (idEmpresa == null && cc.id_centro_costos_principal != null) {
      const principal = await pub.centro_costos_principal.first({ id: cc.id_centro_costos_principal });
      idEmpresa = principal?.id_empresa ?? null;
    }
    const [empresa, anexo] = await Promise.all([
      idEmpresa != null ? pub.Empresas.first({ id_empresa: idEmpresa }) : Promise.resolve(null),
      cc.id_anexo != null ? pub.Anexos.first({ id: cc.id_anexo }) : Promise.resolve(null),
    ]);
    return {
      estado: cc.estado ?? undefined,
      fecha_inicio: cc.fecha_inicio ? readDateOnly(cc.fecha_inicio) : undefined,
      fecha_fin_prog: cc.fecha_fin_prog ? readDateOnly(cc.fecha_fin_prog) : undefined,
      fecha_fin_real: cc.fecha_fin_real ? readDateOnly(cc.fecha_fin_real) : undefined,
      empresa: empresa?.razon_social ?? undefined,
      cliente: anexo?.Anexo ?? anexo?.NombreComercial ?? undefined,
      cod_cliente: cc.cod_cliente ?? undefined,
    };
  }
}
