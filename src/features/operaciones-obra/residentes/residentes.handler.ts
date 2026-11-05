import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { toVarchar } from '../../../platform/db/varchar-helpers.js';
import { assertCentroCosto, compact } from '../shared/obra-shared.js';
import { cargarDirectorio, cargarHistorialEquipo, contactosDeTrabajadores, ETIQUETAS_ROL, mapResidente, ROL_COMPLEMENTO_EQUIPO, rolesPorPersona } from './directorio.js';
import type { CreateObraResidenteDto, DatosEquipoDirectorioDto, ObraResidenteDto, UpdateObraResidenteDto } from './residentes.dto.js';

const MSG_REGISTRO_DE_ROL = 'Es parte del historial del equipo de la ficha técnica: no se edita ni se elimina';

/** '' o null = quitar el dato propio (vuelve el de Trabajadores); undefined = no se toca. */
const textoOpcional = (v: string | null | undefined): string | null | undefined => (v === undefined ? undefined : v?.trim() || null);

@Injectable()
export class ResidentesHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Directorio de la obra: el equipo de la ficha técnica primero (una tarjeta por persona y rol) y luego los contactos agregados a mano. */
  async list(idCentroCosto: number): Promise<ObraResidenteDto[]> {
    return cargarDirectorio(this.db.orm.public, idCentroCosto);
  }

  /** Historial del equipo: quiénes ocuparon cada rol de la ficha y dejaron de ocuparlo, del más reciente al más antiguo. */
  async historial(idCentroCosto: number): Promise<ObraResidenteDto[]> {
    await assertCentroCosto(this.db, idCentroCosto);
    return cargarHistorialEquipo(this.db.orm.public, idCentroCosto);
  }

  async create(idCentroCosto: number, dto: CreateObraResidenteDto): Promise<ObraResidenteDto> {
    await assertCentroCosto(this.db, idCentroCosto);
    if (dto.id_anexo !== undefined) {
      const roles = (await this.equipoDeLaFicha(idCentroCosto)).get(dto.id_anexo);
      if (roles) {
        throw new ConflictException(
          `Ya está en el directorio como ${roles.map((r) => ETIQUETAS_ROL[r]).join(' y ')} (equipo de la ficha técnica): complete sus datos desde su tarjeta`,
        );
      }
    }
    let orden = dto.orden;
    if (orden === undefined) {
      const filas = await this.db.orm.public.obra_residentes.where({ id_centro_costo: idCentroCosto }).all();
      orden = filas.reduce((max, r) => Math.max(max, r.orden ?? 0), 0) + 1;
    }
    const row = await this.db.orm.public.obra_residentes.create({
      id_centro_costo: idCentroCosto,
      id_anexo: dto.id_anexo,
      nombre_completo: toVarchar<200>(dto.nombre_completo.trim()),
      rol_obra: toVarchar<100>(dto.rol_obra.trim()),
      especialidad: toVarchar<150>(dto.especialidad),
      telefono: toVarchar<50>(dto.telefono),
      correo: toVarchar<150>(dto.correo),
      turno: toVarchar<100>(dto.turno),
      estado_planta: toVarchar<50>(dto.estado_planta ?? 'En Planta'),
      orden,
    });
    return mapResidente(row);
  }

  async update(idCentroCosto: number, idResidente: number, dto: UpdateObraResidenteDto): Promise<ObraResidenteDto> {
    const fila = await this.findOrFail(idCentroCosto, idResidente);
    if (fila.rol_equipo != null) throw new BadRequestException(MSG_REGISTRO_DE_ROL);
    const row = await this.db.orm.public.obra_residentes.where({ id: idResidente }).update(
      compact({
        id_anexo: dto.id_anexo,
        nombre_completo: toVarchar<200>(dto.nombre_completo?.trim()),
        rol_obra: toVarchar<100>(dto.rol_obra?.trim()),
        especialidad: toVarchar<150>(dto.especialidad),
        telefono: toVarchar<50>(dto.telefono),
        correo: toVarchar<150>(dto.correo),
        turno: toVarchar<100>(dto.turno),
        estado_planta: toVarchar<50>(dto.estado_planta),
        orden: dto.orden,
      }),
    );
    if (!row) throw new NotFoundException(`Residente ${idResidente} no encontrado`);
    return mapResidente(row);
  }

  /**
   * Datos de obra (teléfono y correo de obra, especialidad, turno, estado) de una persona del equipo de la ficha.
   * Nombre y cargo no se tocan: salen de la ficha técnica y de Trabajadores.
   */
  async guardarDatosEquipo(idCentroCosto: number, idAnexo: number, dto: DatosEquipoDirectorioDto): Promise<ObraResidenteDto> {
    await assertCentroCosto(this.db, idCentroCosto);
    if (!(await this.equipoDeLaFicha(idCentroCosto)).has(idAnexo)) {
      throw new NotFoundException(`El anexo ${idAnexo} no es parte del equipo de la ficha técnica de esta obra`);
    }
    const pub = this.db.orm.public;
    const datos = {
      especialidad: toVarchar<150>(textoOpcional(dto.especialidad)),
      telefono: toVarchar<50>(textoOpcional(dto.telefono)),
      correo: toVarchar<150>(textoOpcional(dto.correo)),
      turno: toVarchar<100>(textoOpcional(dto.turno)),
      estado_planta: toVarchar<50>(dto.estado_planta),
    };
    // Los datos de obra son de la persona (valen para todas sus tarjetas); los registros de alta y baja de un rol no cuentan.
    const filas = await pub.obra_residentes.where({ id_centro_costo: idCentroCosto, id_anexo: idAnexo }).orderBy((r) => r.orden.asc()).all();
    const fila = filas.find((f) => f.rol_equipo == null);
    if (fila) {
      await pub.obra_residentes.where({ id: fila.id }).update(compact(datos));
    } else {
      const nombre = (await contactosDeTrabajadores(pub, [idAnexo])).get(idAnexo)?.nombre || `#${idAnexo}`;
      await pub.obra_residentes.create({
        id_centro_costo: idCentroCosto,
        id_anexo: idAnexo,
        nombre_completo: toVarchar<200>(nombre.slice(0, 200)),
        rol_obra: toVarchar<100>(ROL_COMPLEMENTO_EQUIPO),
        ...compact(datos),
        estado_planta: datos.estado_planta ?? toVarchar<50>('En Planta'),
        orden: 0,
      });
    }
    const tarjeta = (await this.list(idCentroCosto)).find((r) => r.origen === 'equipo' && r.id_anexo === idAnexo);
    if (!tarjeta) throw new NotFoundException(`El anexo ${idAnexo} no es parte del equipo de la ficha técnica de esta obra`);
    return tarjeta;
  }

  async remove(idCentroCosto: number, idResidente: number) {
    const row = await this.findOrFail(idCentroCosto, idResidente);
    if (row.rol_equipo != null) throw new BadRequestException(MSG_REGISTRO_DE_ROL);
    if (row.id_anexo != null && (await this.equipoDeLaFicha(idCentroCosto)).has(row.id_anexo)) {
      throw new BadRequestException('Es parte del equipo de la ficha técnica: cámbielo o quítelo desde la ficha');
    }
    await this.db.orm.public.obra_residentes.where({ id: idResidente }).delete();
    return { deleted: true, id: idResidente };
  }

  private async equipoDeLaFicha(idCentroCosto: number) {
    return rolesPorPersona(await this.db.orm.public.obra_datos_generales.first({ id_centro_costo: idCentroCosto }));
  }

  private async findOrFail(idCentroCosto: number, idResidente: number) {
    const row = await this.db.orm.public.obra_residentes.first({ id: idResidente, id_centro_costo: idCentroCosto });
    if (!row) throw new NotFoundException(`Residente ${idResidente} no encontrado para CC ${idCentroCosto}`);
    return row;
  }
}
