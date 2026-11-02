import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, or } from '@prisma/orm-postgres/orm-client';
import type { Varchar } from '@prisma/orm-postgres/target/codec-types';
import { pageParams, toPaginated, type Paginated } from '../../../platform/db/pagination.js';
import { nowInstant } from '../../../platform/db/temporal.js';
import { toVarchar, type Varchar255 } from '../../../platform/db/varchar-helpers.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import {
  CreateTrabajadorDto,
  ListTrabajadorQueryDto,
  OpcionCatalogoDto,
  OpcionesTrabajadorDto,
  ResumenTrabajadoresDto,
  TrabajadorResponseDto,
  UpdateTrabajadorDto,
} from './trabajador.dto.js';

/** Los trabajadores son anexos de este tipo; el resto de anexos (proveedores, clientes) no se tocan aquí. */
const TRABAJADOR = 'Trabajador';

type AnexoRow = {
  id: number;
  tipoAnexo: 'Proveedor' | 'Cliente' | 'Trabajador' | null;
  Anexo: Varchar255 | null;
  AnexoTipoDocIdeId: number | null;
  NumeroDocIde: Varchar255 | null;
  AnexoEspecialidadId: number | null;
  Direccion: Varchar255 | null;
  Telefono: Varchar255 | null;
  Correo: Varchar255 | null;
  estado: boolean;
};

type FichaRow = {
  id_anexo: number;
  id_tipo_trabajador: number | null;
  id_modalidad_contrato: number | null;
  id_area: number | null;
  direccion_institucional: Varchar255 | null;
  telefono_institucional: Varchar<60> | null;
  correo_institucional: Varchar255 | null;
};

type AnexoUpdateData = Partial<{
  Anexo: Varchar255 | null;
  AnexoTipoDocIdeId: number | null;
  NumeroDocIde: Varchar255 | null;
  AnexoEspecialidadId: number | null;
  Direccion: Varchar255 | null;
  Telefono: Varchar255 | null;
  Correo: Varchar255 | null;
  estado: boolean;
}>;

type FichaUpdateData = Partial<{
  id_tipo_trabajador: number | null;
  id_modalidad_contrato: number | null;
  id_area: number | null;
  direccion_institucional: Varchar255 | null;
  telefono_institucional: Varchar<60> | null;
  correo_institucional: Varchar255 | null;
}>;

/** Nombres que acompañan a la respuesta (catálogos y áreas). */
type Nombres = { tipos: Map<number, string>; modalidades: Map<number, string>; areas: Map<number, string> };

/** Trabajadores (RR.HH.): los registra y mantiene RR.HH.; Anexos ya no los crea ni los edita. */
@Injectable()
export class TrabajadorHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(query: ListTrabajadorQueryDto): Promise<Paginated<TrabajadorResponseDto>> {
    const { page, pageSize, offset } = pageParams(query);
    const texto = query.busqueda?.trim();
    // Los filtros que dependen de la ficha se resuelven a una lista de ids (son pocos cientos de trabajadores).
    const ids = await this.idsPorFicha(query);
    if (ids !== null && ids.length === 0) return toPaginated([], 0, page, pageSize);
    const collection = this.db.orm.public.Anexos.orderBy((t) => t.Anexo.asc()).where((t) =>
      and(
        t.tipoAnexo.eq(TRABAJADOR),
        ...(texto ? [or(t.Anexo.ilike(`%${texto}%`), t.NumeroDocIde.ilike(`%${texto}%`))] : []),
        ...(query.estado !== undefined ? [t.estado.eq(query.estado)] : []),
        ...(query.situacion === 'documento-pendiente'
          ? [or(t.NumeroDocIde.isNull(), t.NumeroDocIde.eq(toVarchar('')), t.NumeroDocIde.ilike('-%'))]
          : []),
        ...(ids !== null ? [t.id.in(ids)] : []),
      ),
    );
    const [total, filas] = await Promise.all([
      collection.aggregate((agg) => ({ total: agg.count() })),
      collection.limit(pageSize).offset(offset).all(),
    ]);
    return toPaginated(await this.armar(filas), total.total, page, pageSize);
  }

  /** Conteos para las tarjetas de la lista (todos los trabajadores). */
  async resumen(): Promise<ResumenTrabajadoresDto> {
    const anexos = this.db.orm.public.Anexos;
    const [total, activos, documentoPendiente, conFicha] = await Promise.all([
      anexos.where((t) => t.tipoAnexo.eq(TRABAJADOR)).aggregate((agg) => ({ total: agg.count() })),
      anexos.where((t) => and(t.tipoAnexo.eq(TRABAJADOR), t.estado.eq(true))).aggregate((agg) => ({ total: agg.count() })),
      anexos
        .where((t) =>
          and(t.tipoAnexo.eq(TRABAJADOR), or(t.NumeroDocIde.isNull(), t.NumeroDocIde.eq(toVarchar('')), t.NumeroDocIde.ilike('-%'))),
        )
        .aggregate((agg) => ({ total: agg.count() })),
      this.db.orm.public.trabajador.aggregate((agg) => ({ total: agg.count() })),
    ]);
    return {
      total: total.total,
      activos: activos.total,
      deBaja: total.total - activos.total,
      fichaPendiente: Math.max(0, total.total - conFicha.total),
      documentoPendiente: documentoPendiente.total,
    };
  }

  async getById(id: number): Promise<TrabajadorResponseDto> {
    const [respuesta] = await this.armar([await this.trabajador(id)]);
    if (!respuesta) throw new NotFoundException(`Trabajador ${id} no encontrado`);
    return respuesta;
  }

  /** Lo que ofrece el formulario: tipos de documento de trabajador y los dos catálogos (con su estado). */
  async opciones(): Promise<OpcionesTrabajadorDto> {
    const [docs, tipos, modalidades] = await Promise.all([
      this.db.orm.public.Anexo_TipoDocIDE.where((d) => d.TipoAnexo.eq(toVarchar(TRABAJADOR))).orderBy((d) => d.id.asc()).all(),
      this.db.orm.public.rrhh_tipo_trabajador.orderBy((t) => t.orden.asc()).all(),
      this.db.orm.public.rrhh_modalidad_contrato.orderBy((m) => m.orden.asc()).all(),
    ]);
    const opcion = (o: { id: number; nombre: unknown; activo: boolean }): OpcionCatalogoDto => ({ id: o.id, nombre: String(o.nombre), activo: o.activo });
    return {
      tiposDocumento: docs.map((d) => ({ id: d.id, nombre: String(d.Anexo_Documento_IDE ?? `ID ${d.id}`), activo: true })),
      tiposTrabajador: tipos.map(opcion),
      modalidadesContrato: modalidades.map(opcion),
    };
  }

  async create(dto: CreateTrabajadorDto): Promise<TrabajadorResponseDto> {
    const nombreLimpio = nombre(dto.Anexo);
    const documento = await this.validarDocumento(dto.AnexoTipoDocIdeId, dto.NumeroDocIde, null);
    await this.validarCatalogos(dto.idTipoTrabajador, dto.idModalidadContrato, dto.idArea ?? null);
    let id = 0;
    await this.db.transaction(async (tx) => {
      const anexo = await tx.orm.public.Anexos.create({
        tipoAnexo: TRABAJADOR,
        Anexo: toVarchar(nombreLimpio),
        AnexoTipoDocIdeId: dto.AnexoTipoDocIdeId,
        NumeroDocIde: toVarchar(documento),
        AnexoEspecialidadId: dto.AnexoEspecialidadId ?? null,
        Direccion: toVarchar(texto(dto.Direccion)),
        Telefono: toVarchar(texto(dto.Telefono)),
        Correo: toVarchar(texto(dto.Correo)),
        estado: dto.estado ?? true,
      });
      id = anexo.id;
      await tx.orm.public.trabajador.create({
        id_anexo: anexo.id,
        id_tipo_trabajador: dto.idTipoTrabajador,
        id_modalidad_contrato: dto.idModalidadContrato,
        id_area: dto.idArea ?? null,
        direccion_institucional: toVarchar(texto(dto.direccionInstitucional)),
        telefono_institucional: toVarchar<60>(texto(dto.telefonoInstitucional)),
        correo_institucional: toVarchar(texto(dto.correoInstitucional)),
      });
    });
    // La respuesta se arma después del commit (otra conexión no ve filas sin confirmar).
    return this.getById(id);
  }

  async update(id: number, dto: UpdateTrabajadorDto): Promise<TrabajadorResponseDto> {
    const actual = await this.trabajador(id);
    const ficha = await this.db.orm.public.trabajador.first({ id_anexo: id });
    obligatorio(dto.Anexo, 'El nombre del trabajador es obligatorio');
    obligatorio(dto.AnexoTipoDocIdeId, 'Elige el tipo de documento');
    obligatorio(dto.NumeroDocIde, 'Escribe el número de documento');
    obligatorio(dto.idTipoTrabajador, 'Elige el tipo de trabajador');
    obligatorio(dto.idModalidadContrato, 'Elige la modalidad de contrato');

    const anexo: AnexoUpdateData = {};
    if (dto.Anexo !== undefined) anexo.Anexo = toVarchar(nombre(dto.Anexo));
    if (dto.AnexoTipoDocIdeId !== undefined || dto.NumeroDocIde !== undefined) {
      const tipoDoc = dto.AnexoTipoDocIdeId ?? actual.AnexoTipoDocIdeId;
      if (tipoDoc === null) throw new BadRequestException('Elige el tipo de documento');
      anexo.AnexoTipoDocIdeId = tipoDoc;
      anexo.NumeroDocIde = toVarchar(await this.validarDocumento(tipoDoc, dto.NumeroDocIde ?? String(actual.NumeroDocIde ?? ''), id));
    }
    if (dto.AnexoEspecialidadId !== undefined) anexo.AnexoEspecialidadId = dto.AnexoEspecialidadId;
    if (dto.Direccion !== undefined) anexo.Direccion = toVarchar(texto(dto.Direccion));
    if (dto.Telefono !== undefined) anexo.Telefono = toVarchar(texto(dto.Telefono));
    if (dto.Correo !== undefined) anexo.Correo = toVarchar(texto(dto.Correo));
    if (dto.estado !== undefined) anexo.estado = dto.estado;

    const cambiosFicha: FichaUpdateData = {};
    if (dto.idTipoTrabajador !== undefined) cambiosFicha.id_tipo_trabajador = dto.idTipoTrabajador;
    if (dto.idModalidadContrato !== undefined) cambiosFicha.id_modalidad_contrato = dto.idModalidadContrato;
    if (dto.idArea !== undefined) cambiosFicha.id_area = dto.idArea;
    if (dto.direccionInstitucional !== undefined) cambiosFicha.direccion_institucional = toVarchar(texto(dto.direccionInstitucional));
    if (dto.telefonoInstitucional !== undefined) cambiosFicha.telefono_institucional = toVarchar<60>(texto(dto.telefonoInstitucional));
    if (dto.correoInstitucional !== undefined) cambiosFicha.correo_institucional = toVarchar(texto(dto.correoInstitucional));
    const tocaFicha = Object.keys(cambiosFicha).length > 0;
    if (tocaFicha) {
      // Solo se valida lo que cambia: una opción que se desactivó puede quedarse en quien ya la tenía.
      await this.validarCatalogos(
        cambia(dto.idTipoTrabajador, ficha?.id_tipo_trabajador),
        cambia(dto.idModalidadContrato, ficha?.id_modalidad_contrato),
        cambia(dto.idArea, ficha?.id_area) ?? null,
      );
      if ((dto.idTipoTrabajador ?? ficha?.id_tipo_trabajador ?? null) === null) throw new BadRequestException('Elige el tipo de trabajador');
      if ((dto.idModalidadContrato ?? ficha?.id_modalidad_contrato ?? null) === null) throw new BadRequestException('Elige la modalidad de contrato');
    }

    await this.db.transaction(async (tx) => {
      if (Object.keys(anexo).length > 0) await tx.orm.public.Anexos.where({ id }).update(anexo);
      if (!tocaFicha) return;
      if (ficha) await tx.orm.public.trabajador.where({ id_anexo: id }).update({ ...cambiosFicha, updated_at: nowInstant() });
      else await tx.orm.public.trabajador.create({ id_anexo: id, ...cambiosFicha });
    });
    return this.getById(id);
  }

  /**
   * Ids de trabajador que cumplen los filtros de la ficha (tipo, modalidad, área o ficha pendiente).
   * `null` = no hay filtros de ficha.
   */
  private async idsPorFicha(query: ListTrabajadorQueryDto): Promise<number[] | null> {
    const porCampos = query.idTipoTrabajador !== undefined || query.idModalidadContrato !== undefined || query.idArea !== undefined;
    if (query.situacion === 'ficha-pendiente') {
      // Sin ficha no hay tipo, modalidad ni área: combinado con esos filtros no queda nadie.
      if (porCampos) return [];
      const [todos, fichas] = await Promise.all([
        this.db.orm.public.Anexos.where((t) => t.tipoAnexo.eq(TRABAJADOR)).all(),
        this.db.orm.public.trabajador.all(),
      ]);
      const conFicha = new Set(fichas.map((f) => f.id_anexo));
      return todos.map((a) => a.id).filter((id) => !conFicha.has(id));
    }
    if (!porCampos) return null;
    const fichas = await this.db.orm.public.trabajador
      .where((f) =>
        and(
          ...(query.idTipoTrabajador !== undefined ? [f.id_tipo_trabajador.eq(query.idTipoTrabajador)] : []),
          ...(query.idModalidadContrato !== undefined ? [f.id_modalidad_contrato.eq(query.idModalidadContrato)] : []),
          ...(query.idArea !== undefined ? [f.id_area.eq(query.idArea)] : []),
        ),
      )
      .all();
    return fichas.map((f) => f.id_anexo);
  }

  /** El anexo existe y es un trabajador (un proveedor o cliente no se ve ni se edita desde aquí). */
  private async trabajador(id: number): Promise<AnexoRow> {
    const row = await this.db.orm.public.Anexos.first({ id });
    if (!row || row.tipoAnexo !== TRABAJADOR) throw new NotFoundException(`Trabajador ${id} no encontrado`);
    return row;
  }

  /**
   * Tipo de documento de trabajador y número con el formato de ese tipo (DNI: 8 dígitos; pasaporte: 6 a 12
   * letras o números; otro: 4 a 20). No puede repetirse en otro trabajador. Devuelve el número normalizado.
   */
  private async validarDocumento(idTipoDoc: number, numero: string, excluirId: number | null): Promise<string> {
    const tipo = await this.db.orm.public.Anexo_TipoDocIDE.first({ id: idTipoDoc });
    if (!tipo || String(tipo.TipoAnexo ?? '') !== TRABAJADOR) throw new BadRequestException('Elige un tipo de documento de trabajador');
    const valor = numero.trim().toUpperCase();
    if (!valor || /^-+$/.test(valor)) throw new BadRequestException('Escribe el número de documento');
    const nombreTipo = String(tipo.Anexo_Documento_IDE ?? '').toUpperCase();
    if (nombreTipo === 'DNI' && !/^\d{8}$/.test(valor)) throw new BadRequestException('El DNI tiene 8 dígitos');
    if (nombreTipo === 'PASAPORTE' && !/^[A-Z0-9]{6,12}$/.test(valor)) throw new BadRequestException('El pasaporte tiene de 6 a 12 letras o números');
    if (!/^[A-Z0-9-]{4,20}$/.test(valor)) throw new BadRequestException('El documento debe tener de 4 a 20 letras o números');
    const iguales = await this.db.orm.public.Anexos.where((t) => and(t.tipoAnexo.eq(TRABAJADOR), t.NumeroDocIde.ilike(valor))).all();
    const otro = iguales.find((a) => a.id !== excluirId);
    if (otro) throw new ConflictException(`Ya existe un trabajador con ese documento: ${String(otro.Anexo ?? `ID ${otro.id}`)}`);
    return valor;
  }

  /** Tipo y modalidad activos, y el área existente y activa (solo los que se envían). */
  private async validarCatalogos(idTipo: number | undefined, idModalidad: number | undefined, idArea: number | null): Promise<void> {
    if (idTipo !== undefined) {
      const tipo = await this.db.orm.public.rrhh_tipo_trabajador.first({ id: idTipo });
      if (!tipo?.activo) throw new BadRequestException('El tipo de trabajador no existe o está desactivado');
    }
    if (idModalidad !== undefined) {
      const modalidad = await this.db.orm.public.rrhh_modalidad_contrato.first({ id: idModalidad });
      if (!modalidad?.activo) throw new BadRequestException('La modalidad de contrato no existe o está desactivada');
    }
    if (idArea !== null) {
      const area = await this.db.orm.public.area.first({ id: idArea });
      if (!area?.estado) throw new BadRequestException('El área no existe o está desactivada');
    }
  }

  /** Une cada anexo con su ficha y los nombres de tipo, modalidad y área. */
  private async armar(filas: readonly AnexoRow[]): Promise<TrabajadorResponseDto[]> {
    if (filas.length === 0) return [];
    const fichas = await this.db.orm.public.trabajador.where((t) => t.id_anexo.in(filas.map((f) => f.id))).all();
    const idsArea = [...new Set(fichas.flatMap((f) => (f.id_area === null ? [] : [f.id_area])))];
    const [tipos, modalidades, areas] = await Promise.all([
      this.db.orm.public.rrhh_tipo_trabajador.all(),
      this.db.orm.public.rrhh_modalidad_contrato.all(),
      idsArea.length > 0 ? this.db.orm.public.area.where((a) => a.id.in(idsArea)).all() : Promise.resolve([]),
    ]);
    const nombres: Nombres = {
      tipos: new Map(tipos.map((t) => [t.id, String(t.nombre)])),
      modalidades: new Map(modalidades.map((m) => [m.id, String(m.nombre)])),
      areas: new Map(areas.map((a) => [a.id, String(a.nombre)])),
    };
    const porAnexo = new Map(fichas.map((f) => [f.id_anexo, f]));
    return filas.map((f) => toResponse(f, porAnexo.get(f.id) ?? null, nombres));
  }
}

/** El nombre es obligatorio: no se guarda vacío ni solo con espacios. */
function nombre(valor: string | null): string {
  const limpio = (valor ?? '').trim();
  if (!limpio) throw new BadRequestException('El nombre del trabajador es obligatorio');
  return limpio;
}

/** Texto opcional: sin espacios sobrantes; vacío = null. */
function texto(valor: string | null | undefined): string | null {
  const limpio = (valor ?? '').trim();
  return limpio ? limpio : null;
}

/** Un dato obligatorio puede no enviarse en la edición, pero no puede enviarse vacío. */
function obligatorio(valor: unknown, mensaje: string): void {
  if (valor === null) throw new BadRequestException(mensaje);
}

/** El valor enviado si difiere del guardado; `undefined` si no se envió o no cambia. */
function cambia(enviado: number | null | undefined, guardado: number | null | undefined): number | undefined {
  return enviado === undefined || enviado === null || enviado === guardado ? undefined : enviado;
}

function toResponse(row: AnexoRow, ficha: FichaRow | null, nombres: Nombres): TrabajadorResponseDto {
  const nombreDe = (valor: number | null | undefined, mapa: Map<number, string>) => (valor == null ? null : (mapa.get(valor) ?? null));
  return {
    id: row.id,
    Anexo: row.Anexo,
    AnexoTipoDocIdeId: row.AnexoTipoDocIdeId,
    NumeroDocIde: row.NumeroDocIde,
    AnexoEspecialidadId: row.AnexoEspecialidadId,
    Direccion: row.Direccion,
    Telefono: row.Telefono,
    Correo: row.Correo,
    estado: row.estado,
    conFicha: ficha !== null,
    idTipoTrabajador: ficha?.id_tipo_trabajador ?? null,
    tipoTrabajador: nombreDe(ficha?.id_tipo_trabajador, nombres.tipos),
    idModalidadContrato: ficha?.id_modalidad_contrato ?? null,
    modalidadContrato: nombreDe(ficha?.id_modalidad_contrato, nombres.modalidades),
    idArea: ficha?.id_area ?? null,
    area: nombreDe(ficha?.id_area, nombres.areas),
    direccionInstitucional: ficha?.direccion_institucional ?? null,
    telefonoInstitucional: ficha?.telefono_institucional ?? null,
    correoInstitucional: ficha?.correo_institucional ?? null,
  };
}
