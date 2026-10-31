import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { throwIfUniqueViolation } from '../../../platform/db/pg-errors.js';
import { nowInstant } from '../../../platform/db/temporal.js';
import { toVarchar } from '../../../platform/db/varchar-helpers.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { cargarObra } from '../shared/control-avance/carga-obra.js';
import { ROLES_EQUIPO, type RolEquipo } from '../shared/control-avance/equipo.js';
import { registrarEvento } from '../shared/control-avance/registrar-evento.js';
import { SEMANAS_AVANCE, SEMANAS_META } from '../shared/control-avance/control-avance.types.js';
import { assertCentroCosto, hoyLima, toDateOnly } from '../shared/obra-shared.js';
import { buscarPersona, type PersonaCandidata } from './buscar-persona.js';
import { interpretarProyecto, normT, type LecturaExcel, type Mensaje } from './excel-proyecto.js';
import { leerLibro } from './leer-libro.js';
import type { EquipoImportacionDto, ResultadoImportacionExcelDto, ResumenImportacionDto, VistaPreviaImportacionDto } from './importacion.dto.js';

/** Archivo recibido por multer (en memoria). */
export interface ArchivoExcel {
  originalname: string;
  buffer: Buffer;
  size: number;
}

const CAMPO_EQUIPO: Readonly<Record<RolEquipo, { id: string; texto: keyof LecturaExcel['ficha']; etiqueta: string }>> = {
  jefe_proyecto: { id: 'id_jefe_proyecto', texto: 'jefe', etiqueta: 'jefe de proyecto' },
  coordinador: { id: 'id_coordinador', texto: 'coordinador', etiqueta: 'coordinador' },
  residente: { id: 'id_residente', texto: 'residente', etiqueta: 'residente' },
  resp_presupuesto: { id: 'id_resp_presupuesto', texto: 'respPresupuesto', etiqueta: 'responsable de presupuesto' },
  resp_procura: { id: 'id_resp_procura', texto: 'respProcura', etiqueta: 'responsable de procura' },
};

interface Analisis {
  lectura: LecturaExcel;
  equipo: (EquipoImportacionDto & { requerido: boolean })[];
  errores: Mensaje[];
  avisos: Mensaje[];
  resumen: ResumenImportacionDto;
  actual: VistaPreviaImportacionDto['obra_actual'];
  reemplaza: boolean;
}

/**
 * RF-OP-52 · Importa a una obra el Excel vigente («Ficha», «Partidas» y «Reprogramaciones») que hoy
 * llena cada jefe de proyecto. Sirve para la transición: el archivo trae la ficha, la estructura con
 * sus metas manuales, el avance de cada semana y las reprogramaciones. Primero se pide la vista
 * previa (no escribe nada) y luego se confirma; todo se escribe en una sola transacción.
 */
@Injectable()
export class ImportacionHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async vistaPrevia(idCentroCosto: number, archivo: ArchivoExcel | undefined): Promise<VistaPreviaImportacionDto> {
    const a = await this.analizar(idCentroCosto, archivo);
    return {
      archivo: archivo!.originalname,
      importable: a.errores.length === 0,
      ficha: { ...a.lectura.ficha },
      resumen: a.resumen,
      equipo: a.equipo.map(({ requerido: _r, ...e }) => e),
      obra_actual: a.actual,
      reemplaza_estructura: a.reemplaza,
      errores: a.errores,
      avisos: a.avisos,
    };
  }

  async importar(idCentroCosto: number, archivo: ArchivoExcel | undefined, usuario: string): Promise<ResultadoImportacionExcelDto> {
    const a = await this.analizar(idCentroCosto, archivo);
    if (a.errores.length > 0) {
      throw new BadRequestException({ message: `El archivo tiene ${a.errores.length} error(es): corríjalos y vuelva a intentar`, errores: a.errores });
    }
    const { ficha, partidas, reprogramaciones } = a.lectura;
    const inicio = ficha.inicio!;
    const fin = ficha.fin!;
    const entrega = ficha.entrega;
    const cierre = entrega && ficha.cierre && ficha.cierre >= entrega ? ficha.cierre : null;
    // Solo se pisan las personas que el archivo permitió identificar.
    const idsEquipo: Record<string, number> = {};
    for (const e of a.equipo) if (e.persona) idsEquipo[CAMPO_EQUIPO[e.rol as RolEquipo].id] = e.persona.id;

    try {
      await this.db.transaction(async (tx) => {
        const t = tx.orm.public;

        const cambiosCc: Record<string, unknown> = { fecha_inicio: toDateOnly(inicio), fecha_fin_prog: toDateOnly(fin) };
        if (entrega && (ficha.estado === 'POST_VENTA' || ficha.estado === 'CULMINADO')) cambiosCc['fecha_fin_real'] = toDateOnly(entrega);
        await t.CentroCostos.where({ id: idCentroCosto }).update(cambiosCc);

        const gen = {
          codigo_obra: toVarchar<30>(ficha.codigo),
          tienda: toVarchar<80>(ficha.tienda),
          departamento: toVarchar<100>(ficha.departamento),
          comentario: toVarchar<200>(ficha.comentario || null),
          estado_obra: ficha.estado!,
          plazo_postventa_dias: ficha.plazoPostVenta,
          observaciones_postventa: toVarchar<200>(ficha.observacionesPostVenta || null),
          ...(cierre ? { fecha_cierre_postventa: toDateOnly(cierre) } : {}),
          ...(partidas.length === 0 && ficha.avanceGeneral !== null ? { avance_general: String(ficha.avanceGeneral) } : {}),
          ...idsEquipo,
          actualizado_por: toVarchar<255>(usuario),
          updated_at: nowInstant(),
        };
        const existente = await t.obra_datos_generales.first({ id_centro_costo: idCentroCosto });
        if (existente) await t.obra_datos_generales.where({ id: existente.id }).update(gen);
        else await t.obra_datos_generales.create({ id_centro_costo: idCentroCosto, ...gen });

        if (partidas.length > 0) {
          await t.obra_partida.where({ id_centro_costo: idCentroCosto }).delete(); // sus subpartidas y semanas, en cascada
          let pOrden = 0;
          for (const p of partidas) {
            pOrden++;
            const partida = await t.obra_partida.create({
              id_centro_costo: idCentroCosto,
              item: toVarchar<20>(p.item),
              nombre: toVarchar<150>(p.nombre),
              tipo: p.tipo,
              orden: pOrden,
            });
            let sOrden = 0;
            for (const s of p.subpartidas) {
              sOrden++;
              const sub = await t.obra_subpartida.create({
                id_partida: partida.id,
                id_centro_costo: idCentroCosto,
                item: toVarchar<20>(s.item),
                nombre: toVarchar<150>(s.nombre),
                ...(s.tipo === p.tipo ? {} : { tipo: s.tipo }),
                fecha_inicio: toDateOnly(s.inicio)!,
                fecha_fin: toDateOnly(s.fin)!,
                orden: sOrden,
                observacion: toVarchar<200>(s.observacion),
              });
              for (let semana = 1; semana <= SEMANAS_AVANCE; semana++) {
                const meta = semana <= SEMANAS_META ? (s.metas?.[semana - 1] ?? null) : null;
                const avance = s.avance[semana - 1] ?? null;
                if (meta === null && avance === null) continue;
                await t.obra_subpartida_semana.create({
                  id_subpartida: sub.id,
                  numero_semana: semana,
                  ...(meta === null ? {} : { meta: String(meta) }),
                  ...(avance === null ? {} : { avance: String(avance), registrado_por: toVarchar<255>(usuario), registrado_en: nowInstant() }),
                });
              }
            }
          }
        }

        await t.obra_reprogramacion.where({ id_centro_costo: idCentroCosto }).delete();
        for (const r of reprogramaciones) {
          await t.obra_reprogramacion.create({
            id_centro_costo: idCentroCosto,
            desde: toDateOnly(r.desde)!,
            dias: r.dias,
            motivo: r.motivo,
            detalle: toVarchar<160>(r.detalle),
            registrado_por: toVarchar<255>(usuario),
          });
        }

        await registrarEvento(t, {
          idCentroCosto,
          tipo: 'ALTA',
          titulo: `Importado desde Excel: ${archivo!.originalname}`.slice(0, 200),
          detalle: [
            `${a.resumen.partidas} partida(s) y ${a.resumen.subpartidas} subpartida(s)`,
            `${a.resumen.reprogramaciones} reprogramación(es)`,
            a.reemplaza ? 'reemplazó la estructura anterior' : null,
            a.actual.estado_obra && a.actual.estado_obra !== ficha.estado ? `estado ${a.actual.estado_obra} → ${ficha.estado}` : null,
          ]
            .filter(Boolean)
            .join(' · '),
          usuario,
        });
      });
    } catch (e) {
      throwIfUniqueViolation(e, `El código de obra ${ficha.codigo} o un ítem del archivo ya existe`);
      throw e;
    }
    return { importado: true, resumen: a.resumen, avisos: a.avisos };
  }

  // ─── Análisis (común a la vista previa y a la importación) ─────────────────
  private async analizar(idCentroCosto: number, archivo: ArchivoExcel | undefined): Promise<Analisis> {
    if (!archivo?.buffer?.length) throw new BadRequestException('Adjunte el archivo Excel (.xlsx) en el campo «archivo»');
    if (!/\.xlsx$/i.test(archivo.originalname)) throw new BadRequestException('Solo se aceptan archivos .xlsx');
    const cc = await assertCentroCosto(this.db, idCentroCosto);
    const orm = this.db.orm.public;

    let hojas;
    try {
      hojas = await leerLibro(archivo.buffer);
    } catch {
      throw new BadRequestException('No se pudo leer el archivo: no es un libro de Excel válido');
    }
    const lectura = interpretarProyecto(hojas, hoyLima());
    if (!lectura) throw new BadRequestException('El archivo no es la plantilla por proyecto: falta la hoja «Ficha» con «Cliente» y «Tienda»');

    const errores: Mensaje[] = [...lectura.errores];
    const avisos: Mensaje[] = [...lectura.avisos];
    const { ficha } = lectura;
    const nombreObra = [ficha.cliente, ficha.tienda].filter(Boolean).join(' ');

    // Estado actual de la obra
    const carga = await cargarObra(orm, idCentroCosto);
    const gen = await orm.obra_datos_generales.first({ id_centro_costo: idCentroCosto });
    const reprogramacionesActuales = await orm.obra_reprogramacion.where({ id_centro_costo: idCentroCosto }).all();
    const subActuales = carga.partidas.flatMap((p) => p.subpartidas);
    const conAvance = subActuales.some((s) => s.avance?.some((v) => v != null));
    const actual = {
      codigo_obra: gen?.codigo_obra ?? null,
      estado_obra: gen?.estado_obra ?? null,
      partidas: carga.partidas.length,
      subpartidas: subActuales.length,
      con_avance: conAvance,
      reprogramaciones: reprogramacionesActuales.length,
    };

    // Código único
    if (ficha.codigo) {
      const otra = await orm.obra_datos_generales.first({ codigo_obra: toVarchar<30>(ficha.codigo) });
      if (otra && otra.id_centro_costo !== idCentroCosto) {
        errores.push({ fila: 'Ficha', nombre: nombreObra, mensaje: `el código ${ficha.codigo} ya lo usa otra obra (centro de costo ${otra.id_centro_costo})` });
      } else if (actual.codigo_obra && actual.codigo_obra !== ficha.codigo) {
        avisos.push({ fila: 'Ficha', nombre: nombreObra, mensaje: `el código de la obra cambia de ${actual.codigo_obra} a ${ficha.codigo}` });
      }
    }

    // Cliente
    if (cc.id_anexo && ficha.cliente) {
      const cliente = await orm.Anexos.first({ id: cc.id_anexo });
      const nombreCliente = cliente?.NombreComercial ?? cliente?.Anexo ?? null;
      if (nombreCliente && !normT(nombreCliente).includes(normT(ficha.cliente)) && !normT(ficha.cliente).includes(normT(nombreCliente))) {
        avisos.push({ fila: 'Ficha', nombre: nombreObra, mensaje: `el cliente del archivo («${ficha.cliente}») no coincide con el del centro de costo («${nombreCliente}»)` });
      }
    }

    // Equipo: nombres del Excel → maestro de trabajadores
    const trabajadores = (await orm.Anexos.where((a) => a.estado.eq(true)).all()).filter((a) => a.tipoAnexo === 'Trabajador');
    const candidatos: PersonaCandidata[] = trabajadores.map((a) => ({ id: a.id, nombre: a.Anexo ?? a.NombreComercial ?? '' })).filter((c) => c.nombre);
    const genIds = (gen ?? {}) as Record<string, number | null | undefined>;
    const equipo = ROLES_EQUIPO.map((rol) => {
      const def = CAMPO_EQUIPO[rol];
      const texto = String(ficha[def.texto] ?? '');
      const r = buscarPersona(texto, candidatos);
      const requerido = rol === 'jefe_proyecto' || rol === 'coordinador';
      if (!r.persona && r.motivo !== 'vacio') {
        const detalle = r.motivo === 'ambiguo' ? `coincide con varias personas (${r.candidatos.join(', ')})` : 'no está en el maestro de Trabajadores';
        const yaTiene = genIds[def.id] != null;
        const mensaje = `${def.etiqueta} «${texto}»: ${detalle}${yaTiene ? '; se conserva el actual' : ''}`;
        if (requerido && !yaTiene) errores.push({ fila: 'Ficha', nombre: nombreObra, mensaje });
        else avisos.push({ fila: 'Ficha', nombre: nombreObra, mensaje });
      }
      return { rol, texto, persona: r.persona ? { id: r.persona.id, nombre: r.persona.nombre } : null, requerido };
    });

    // Estructura y avance
    const trae = lectura.partidas.length > 0;
    if (trae && conAvance) {
      errores.push({ fila: 'Partidas', nombre: nombreObra, mensaje: 'la obra ya tiene avance registrado en el ERP: no se puede reemplazar su estructura con este archivo' });
    }
    if (trae && actual.subpartidas > 0 && !conAvance) {
      avisos.push({ fila: 'Partidas', nombre: nombreObra, mensaje: `reemplaza la estructura actual (${actual.partidas} partida(s), ${actual.subpartidas} subpartida(s))` });
    }
    if (reprogramacionesActuales.length > 0) {
      avisos.push({ fila: 'Reprogramaciones', nombre: nombreObra, mensaje: `reemplaza las ${reprogramacionesActuales.length} reprogramación(es) registradas en el ERP por las del archivo (${lectura.reprogramaciones.length})` });
    }
    if (actual.estado_obra && ficha.estado && actual.estado_obra !== ficha.estado) {
      avisos.push({ fila: 'Ficha', nombre: nombreObra, mensaje: `el estado cambia de ${actual.estado_obra} a ${ficha.estado}` });
    }

    const subs = lectura.partidas.flatMap((p) => p.subpartidas);
    const resumen: ResumenImportacionDto = {
      partidas: lectura.partidas.length,
      subpartidas: subs.length,
      subpartidas_con_avance: subs.filter((s) => s.avance.some((v) => v !== null)).length,
      metas_manuales: subs.reduce((n, s) => n + (s.metas?.filter((m) => m !== null).length ?? 0), 0),
      reprogramaciones: lectura.reprogramaciones.length,
    };
    return { lectura, equipo, errores, avisos, resumen, actual, reemplaza: trae && actual.subpartidas > 0 };
  }
}
