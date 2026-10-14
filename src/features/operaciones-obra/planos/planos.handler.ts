import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { toInstantString } from '../../../platform/db/temporal.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { toVarchar } from '../../presupuestos/presupuestos.helpers.js';
import { assertCentroCosto, compact, readDateOnly, toDateOnly } from '../shared/obra-shared.js';
import { existsSync } from 'node:fs';
import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { ArchivoPlanoDto, CreateObraPlanoDto, NuevaVersionPlanoDto, ObraPlanoDto, UpdateObraPlanoDto } from './planos.dto.js';
import { UPLOADS_ROOT, borrarArchivoLocal, carpetaPlanos, esArchivoLocal, formatoPeso, nombreDescarga, rutaSegura } from './planos.storage.js';

/** Archivos sin plano asociado más antiguos que esto se eliminan en la limpieza automática. */
const HUERFANO_MS = 24 * 60 * 60 * 1000;

/** Datos mínimos del archivo que entrega multer (diskStorage). */
export interface ArchivoSubido {
  filename: string;
  originalname: string;
  size: number;
  path: string;
}

export type DescargaPlano = { tipo: 'externo'; url: string } | { tipo: 'local'; ruta: string; nombre: string };

type PlanoRow = NonNullable<Awaited<ReturnType<Database['orm']['public']['obra_planos']['first']>>>;

export function mapPlano(p: PlanoRow): ObraPlanoDto {
  return {
    id: p.id,
    codigo_plano: p.codigo_plano ?? '',
    nombre_plano: p.nombre_plano ?? '',
    disciplina: p.disciplina ?? '',
    version: p.version ?? 'v1.0',
    es_vigente: p.es_vigente ?? true,
    id_plano_anterior: p.id_plano_anterior ?? undefined,
    estado_aprobacion: p.estado_aprobacion ?? 'Aprobado Obra',
    fecha_vobo: p.fecha_vobo ? readDateOnly(p.fecha_vobo) : undefined,
    formato_peso: p.formato_peso ?? undefined,
    archivo_url: p.archivo_url ?? undefined,
    emitido_por: p.emitido_por ?? undefined,
    created_at: toInstantString(p.created_at),
  };
}

/** v1.0 → v2.0 ; Rev.B → Rev.B.1 (fallback) */
export function siguienteVersion(actual: string | null | undefined): string {
  const m = /^v?(\d+)(?:\.(\d+))?$/i.exec((actual ?? '').trim());
  if (!m) return `${(actual ?? 'v1.0').trim()}.1`;
  return `v${Number(m[1]) + 1}.0`;
}

@Injectable()
export class PlanosHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Lista los planos vigentes de la obra. */
  async list(idCentroCosto: number): Promise<ObraPlanoDto[]> {
    const rows = await this.db.orm.public.obra_planos
      .where({ id_centro_costo: idCentroCosto, es_vigente: true })
      .orderBy((p) => p.codigo_plano.asc())
      .all();
    return rows.map(mapPlano);
  }

  async create(idCentroCosto: number, dto: CreateObraPlanoDto): Promise<ObraPlanoDto> {
    await assertCentroCosto(this.db, idCentroCosto);
    this.validarArchivo(idCentroCosto, dto.archivo_url);
    const codigo = dto.codigo_plano.trim().toUpperCase();
    const duplicado = await this.db.orm.public.obra_planos.first({
      id_centro_costo: idCentroCosto,
      codigo_plano: toVarchar<50>(codigo),
      es_vigente: true,
    });
    if (duplicado) {
      throw new ConflictException(`Ya existe un plano vigente con código ${codigo}. Emita una nueva versión.`);
    }

    const row = await this.db.orm.public.obra_planos.create({
      id_centro_costo: idCentroCosto,
      codigo_plano: toVarchar<50>(codigo),
      nombre_plano: toVarchar<255>(dto.nombre_plano.trim()),
      disciplina: toVarchar<50>(dto.disciplina),
      version: toVarchar<20>(dto.version?.trim() || 'v1.0'),
      es_vigente: true,
      estado_aprobacion: toVarchar<50>(dto.estado_aprobacion ?? 'Aprobado Obra'),
      fecha_vobo: toDateOnly(dto.fecha_vobo),
      formato_peso: toVarchar<50>(dto.formato_peso),
      archivo_url: toVarchar<1000>(dto.archivo_url),
      emitido_por: toVarchar<150>(dto.emitido_por),
    });
    return mapPlano(row);
  }

  async update(idCentroCosto: number, idPlano: number, dto: UpdateObraPlanoDto): Promise<ObraPlanoDto> {
    const actual = await this.findOrFail(idCentroCosto, idPlano);
    this.validarArchivo(idCentroCosto, dto.archivo_url);
    const row = await this.db.orm.public.obra_planos.where({ id: idPlano }).update(
      compact({
        nombre_plano: toVarchar<255>(dto.nombre_plano?.trim()),
        disciplina: toVarchar<50>(dto.disciplina),
        estado_aprobacion: toVarchar<50>(dto.estado_aprobacion),
        fecha_vobo: toDateOnly(dto.fecha_vobo),
        formato_peso: toVarchar<50>(dto.formato_peso),
        archivo_url: toVarchar<1000>(dto.archivo_url),
        emitido_por: toVarchar<150>(dto.emitido_por),
      }),
    );
    if (!row) throw new NotFoundException(`Plano ${idPlano} no encontrado`);
    // Si se reemplazó el archivo, se borra el anterior del disco.
    if (dto.archivo_url !== undefined && dto.archivo_url !== actual.archivo_url) {
      await borrarArchivoLocal(idCentroCosto, actual.archivo_url);
    }
    return mapPlano(row);
  }

  /** Emite una nueva revisión: la versión actual deja de ser vigente. */
  async nuevaVersion(idCentroCosto: number, idPlano: number, dto: NuevaVersionPlanoDto): Promise<ObraPlanoDto> {
    const anterior = await this.findOrFail(idCentroCosto, idPlano);
    this.validarArchivo(idCentroCosto, dto.archivo_url);
    if (anterior.es_vigente === false) {
      throw new BadRequestException('Solo se puede emitir una nueva versión a partir del plano vigente');
    }
    const version = dto.version?.trim() || siguienteVersion(anterior.version);
    if (version === anterior.version) {
      throw new BadRequestException(`La nueva versión debe ser distinta de ${anterior.version}`);
    }

    await this.db.orm.public.obra_planos.where({ id: anterior.id }).update({ es_vigente: false });
    const row = await this.db.orm.public.obra_planos.create({
      id_centro_costo: idCentroCosto,
      codigo_plano: anterior.codigo_plano,
      nombre_plano: toVarchar<255>(dto.nombre_plano?.trim() || anterior.nombre_plano),
      disciplina: anterior.disciplina,
      version: toVarchar<20>(version),
      es_vigente: true,
      id_plano_anterior: anterior.id,
      estado_aprobacion: toVarchar<50>(dto.estado_aprobacion ?? 'En Revisión'),
      fecha_vobo: toDateOnly(dto.fecha_vobo),
      formato_peso: toVarchar<50>(dto.formato_peso),
      archivo_url: toVarchar<1000>(dto.archivo_url),
      emitido_por: toVarchar<150>(dto.emitido_por ?? anterior.emitido_por ?? undefined),
    });
    return mapPlano(row);
  }

  /** Historial de revisiones del mismo código de plano (más reciente primero). */
  async historial(idCentroCosto: number, idPlano: number): Promise<ObraPlanoDto[]> {
    const plano = await this.findOrFail(idCentroCosto, idPlano);
    const rows = await this.db.orm.public.obra_planos
      .where({ id_centro_costo: idCentroCosto, codigo_plano: plano.codigo_plano })
      .orderBy((p) => p.id.desc())
      .all();
    return rows.map(mapPlano);
  }

  /** Elimina la versión vigente y restaura la anterior como vigente (si existe). */
  async remove(idCentroCosto: number, idPlano: number) {
    const plano = await this.findOrFail(idCentroCosto, idPlano);
    await this.db.orm.public.obra_planos.where({ id: idPlano }).delete();
    if (plano.es_vigente !== false && plano.id_plano_anterior) {
      await this.db.orm.public.obra_planos.where({ id: plano.id_plano_anterior }).update({ es_vigente: true });
    }
    await borrarArchivoLocal(idCentroCosto, plano.archivo_url);
    return { deleted: true, id: idPlano };
  }

  /** Registra un archivo ya guardado por multer y devuelve la clave + formato/peso. */
  async subirArchivo(idCentroCosto: number, file: ArchivoSubido | undefined): Promise<ArchivoPlanoDto> {
    if (file?.path) {
      if (process.env.ALLOW_LOCAL_STORAGE !== 'true') {
        await unlink(file.path).catch(() => undefined);
        throw new BadRequestException(
          'El almacenamiento local de archivos en el servidor está deshabilitado. Ingrese el enlace en la nube (Google Drive, OneDrive, BIM 360, etc.).',
        );
      }
    }
    if (!file) throw new BadRequestException('Debes adjuntar un archivo (campo "archivo")');
    try {
      await assertCentroCosto(this.db, idCentroCosto);
    } catch (err) {
      await unlink(file.path).catch(() => undefined);
      throw err;
    }
    const original = Buffer.from(file.originalname, 'latin1').toString('utf8');
    void this.limpiarHuerfanos(idCentroCosto);
    return {
      archivo_url: `${carpetaPlanos(idCentroCosto)}/${file.filename}`,
      formato_peso: formatoPeso(original, file.size),
      nombre_original: original,
      bytes: file.size,
    };
  }

  /** Resuelve el archivo de un plano: enlace externo o ruta local en disco. */
  async descargar(idCentroCosto: number, idPlano: number): Promise<DescargaPlano> {
    const plano = await this.findOrFail(idCentroCosto, idPlano);
    const url = plano.archivo_url;
    if (!url) throw new NotFoundException(`El plano ${plano.codigo_plano} no tiene archivo adjunto`);
    if (!esArchivoLocal(url)) return { tipo: 'externo', url };
    const ruta = rutaSegura(idCentroCosto, url);
    if (!existsSync(ruta)) throw new NotFoundException('El archivo del plano ya no existe en el servidor');
    const nombre = nombreDescarga(url);
    return { tipo: 'local', ruta, nombre };
  }

  /** Una clave local solo es válida si pertenece a la carpeta de planos del mismo CC. */
  private validarArchivo(idCentroCosto: number, archivoUrl: string | undefined) {
    if (esArchivoLocal(archivoUrl)) rutaSegura(idCentroCosto, archivoUrl);
  }

  /** Borra un archivo subido que no quedó vinculado a ningún plano (modal cancelado). */
  async descartarArchivo(idCentroCosto: number, clave: string | undefined) {
    if (!esArchivoLocal(clave)) throw new BadRequestException('Clave de archivo inválida');
    const ruta = rutaSegura(idCentroCosto, clave);
    const enUso = await this.db.orm.public.obra_planos.first({
      id_centro_costo: idCentroCosto,
      archivo_url: toVarchar<1000>(clave),
    });
    // Nunca se borra un archivo que ya pertenece a un plano guardado.
    if (enUso) return { deleted: false, clave };
    await unlink(ruta).catch(() => undefined);
    return { deleted: true, clave };
  }

  /**
   * Red de seguridad: elimina archivos de la carpeta del CC sin plano asociado y con más de 24 h
   * (p. ej. si se cerró la pestaña con el modal abierto y no se pudo descartar).
   */
  private async limpiarHuerfanos(idCentroCosto: number): Promise<void> {
    try {
      const carpeta = carpetaPlanos(idCentroCosto);
      const dir = join(UPLOADS_ROOT, carpeta);
      const archivos = await readdir(dir);
      if (archivos.length === 0) return;
      const planos = await this.db.orm.public.obra_planos.where({ id_centro_costo: idCentroCosto }).all();
      const enUso = new Set<string>(planos.flatMap((p) => (p.archivo_url ? [String(p.archivo_url)] : [])));
      const limite = Date.now() - HUERFANO_MS;
      for (const nombre of archivos) {
        const clave = `${carpeta}/${nombre}`;
        if (enUso.has(clave)) continue;
        const info = await stat(join(dir, nombre));
        if (info.isFile() && info.mtimeMs < limite) await unlink(join(dir, nombre)).catch(() => undefined);
      }
    } catch {
      // La limpieza nunca debe romper la subida.
    }
  }

  private async findOrFail(idCentroCosto: number, idPlano: number) {
    const row = await this.db.orm.public.obra_planos.first({ id: idPlano, id_centro_costo: idCentroCosto });
    if (!row) throw new NotFoundException(`Plano ${idPlano} no encontrado para CC ${idCentroCosto}`);
    return row;
  }
}
