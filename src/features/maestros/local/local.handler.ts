import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Varchar } from '@prisma/orm-postgres/target/codec-types';
import { throwIfUniqueViolation } from '../../../platform/db/pg-errors.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import {
  CreateLocalDto,
  LocalResponseDto,
  UpdateLocalDto,
} from './local.dto.js';

type Varchar20 = Varchar<20>;
type Varchar150 = Varchar<150>;
type Varchar255 = Varchar<255>;

function toVarchar<T>(val: unknown): T {
  return val as unknown as T;
}

@Injectable()
export class LocalHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(soloActivos = false): Promise<LocalResponseDto[]> {
    const query = soloActivos
      ? this.db.orm.public.local.where({ estado: true })
      : this.db.orm.public.local;

    const [locales, empresas, centros] = await Promise.all([
      query.orderBy((l) => l.nombre.asc()).all(),
      this.db.orm.public.Empresas.all(),
      this.db.orm.public.CentroCostos.all(),
    ]);

    const mapEmpresas = new Map(empresas.map((e) => [e.id_empresa, e.razon_social]));
    const mapCentros = new Map(
      centros.map((c) => [c.id, { codigo: `CC-${c.id}`, descripcion: c.centro_costo }]),
    );

    return locales.map((row) => this.toResponse(row, mapEmpresas, mapCentros));
  }

  async getById(id: number): Promise<LocalResponseDto> {
    const row = await this.db.orm.public.local.first({ id });
    if (!row) throw new NotFoundException(`Local con id ${id} no encontrado`);

    const [empresa, centro] = await Promise.all([
      row.id_empresa ? this.db.orm.public.Empresas.first({ id_empresa: row.id_empresa }) : null,
      row.id_centro_costo
        ? this.db.orm.public.CentroCostos.first({ id: row.id_centro_costo })
        : null,
    ]);

    const mapEmpresas = empresa ? new Map([[empresa.id_empresa, empresa.razon_social]]) : new Map();
    const mapCentros = centro
      ? new Map([[centro.id, { codigo: `CC-${centro.id}`, descripcion: centro.centro_costo }]])
      : new Map();

    return this.toResponse(row, mapEmpresas, mapCentros);
  }

  async create(dto: CreateLocalDto): Promise<LocalResponseDto> {
    this.validarExclusion(dto.id_empresa, dto.id_centro_costo);
    await this.validarExistenciaPadre(dto.id_empresa, dto.id_centro_costo);

    const derivado = await this.derivarDatos(dto.id_empresa, dto.id_centro_costo);
    const codigo = dto.codigo || derivado.codigo;
    const nombre = dto.nombre || derivado.nombre;
    const direccion = dto.direccion || derivado.direccion;
    if (!codigo) throw new BadRequestException('El código es obligatorio');
    if (!nombre) throw new BadRequestException('El nombre es obligatorio');
    const codigoFinal: string = codigo;

    try {
      const created = await this.db.orm.public.local.create({
        codigo: toVarchar<Varchar20>(codigoFinal),
        nombre: toVarchar<Varchar150>(nombre),
        direccion: direccion ? toVarchar<Varchar255>(direccion) : null,
        id_empresa: dto.id_empresa ?? null,
        id_centro_costo: dto.id_centro_costo ?? null,
        estado: dto.estado ?? true,
      });

      return this.getById(created.id);
    } catch (error) {
      throwIfUniqueViolation(error, `El código de local "${codigoFinal}" ya existe`);
      throw error;
    }
  }

  async update(id: number, dto: UpdateLocalDto): Promise<LocalResponseDto> {
    const actual = await this.db.orm.public.local.first({ id });
    if (!actual) throw new NotFoundException(`Local con id ${id} no encontrado`);

    const nuevoEmpresa = dto.id_empresa !== undefined ? dto.id_empresa : actual.id_empresa;
    const nuevoCentro = dto.id_centro_costo !== undefined ? dto.id_centro_costo : actual.id_centro_costo;

    if (dto.id_empresa !== undefined || dto.id_centro_costo !== undefined) {
      this.validarExclusion(nuevoEmpresa, nuevoCentro);
      await this.validarExistenciaPadre(nuevoEmpresa, nuevoCentro);
    }

    const updateData: {
      nombre?: Varchar150;
      direccion?: Varchar255 | null;
      id_empresa?: number | null;
      id_centro_costo?: number | null;
      estado?: boolean;
    } = {};

    const cambiaPadre = dto.id_empresa !== undefined || dto.id_centro_costo !== undefined;
    const derivado = cambiaPadre
      ? await this.derivarDatos(nuevoEmpresa, nuevoCentro)
      : { codigo: undefined, nombre: undefined, direccion: undefined };
    const nombreNuevo = dto.nombre ?? derivado.nombre;
    const direccionNueva = dto.direccion ?? derivado.direccion;

    if (nombreNuevo !== undefined) updateData.nombre = toVarchar<Varchar150>(nombreNuevo);
    if (direccionNueva !== undefined) {
      updateData.direccion = direccionNueva ? toVarchar<Varchar255>(direccionNueva) : null;
    }
    if (dto.id_empresa !== undefined) updateData.id_empresa = dto.id_empresa;
    if (dto.id_centro_costo !== undefined) updateData.id_centro_costo = dto.id_centro_costo;
    if (dto.estado !== undefined) updateData.estado = dto.estado;

    try {
      await this.db.orm.public.local.where({ id }).update(updateData);
      return this.getById(id);
    } catch (error) {
      throwIfUniqueViolation(error, 'Error de unicidad al actualizar local');
      throw error;
    }
  }

  /** Código, nombre y dirección del local según la Empresa o el Centro de Costo elegido. */
  private async derivarDatos(
    idEmpresa?: number | null,
    idCentroCosto?: number | null,
  ): Promise<{ codigo?: string; nombre?: string; direccion?: string }> {
    if (idEmpresa) {
      const emp = await this.db.orm.public.Empresas.first({ id_empresa: idEmpresa });
      if (emp) {
        return {
          codigo: `EMP-${emp.id_empresa}`,
          nombre: String(emp.razon_social ?? '').slice(0, 150),
          direccion: emp.direccion_entrega ? String(emp.direccion_entrega) : undefined,
        };
      }
    }
    if (idCentroCosto) {
      const cc = await this.db.orm.public.CentroCostos.first({ id: idCentroCosto });
      if (cc) {
        const datosObra = await this.db.orm.public.obra_datos_generales.first({
          id_centro_costo: cc.id,
        });
        return {
          codigo: `CC-${cc.id}`,
          nombre: String(cc.centro_costo ?? '').slice(0, 150),
          direccion: datosObra?.direccion ? String(datosObra.direccion).slice(0, 255) : undefined,
        };
      }
    }
    return {};
  }

  async toggleEstado(id: number, estado: boolean): Promise<LocalResponseDto> {
    const actual = await this.db.orm.public.local.first({ id });
    if (!actual) throw new NotFoundException(`Local con id ${id} no encontrado`);

    await this.db.orm.public.local.where({ id }).update({ estado });
    return this.getById(id);
  }

  private validarExclusion(idEmpresa?: number | null, idCentroCosto?: number | null): void {
    const tieneEmpresa = idEmpresa !== undefined && idEmpresa !== null && idEmpresa > 0;
    const tieneCc = idCentroCosto !== undefined && idCentroCosto !== null && idCentroCosto > 0;

    if ((tieneEmpresa && tieneCc) || (!tieneEmpresa && !tieneCc)) {
      throw new BadRequestException(
        'El local debe asignarse obligatoriamente a una Empresa O a un Centro de Costo (no a ambos ni a ninguno).',
      );
    }
  }

  private async validarExistenciaPadre(
    idEmpresa?: number | null,
    idCentroCosto?: number | null,
  ): Promise<void> {
    if (idEmpresa) {
      const emp = await this.db.orm.public.Empresas.first({ id_empresa: idEmpresa });
      if (!emp) throw new BadRequestException(`La empresa con ID ${idEmpresa} no existe.`);
    }
    if (idCentroCosto) {
      const cc = await this.db.orm.public.CentroCostos.first({ id: idCentroCosto });
      if (!cc) throw new BadRequestException(`El centro de costo con ID ${idCentroCosto} no existe.`);
    }
  }

  private toResponse(
    row: {
      id: number;
      codigo: unknown;
      nombre: unknown;
      direccion: unknown;
      id_empresa: number | null;
      id_centro_costo: number | null;
      estado: boolean;
    },
    mapEmpresas: Map<number, unknown>,
    mapCentros: Map<number, { codigo: unknown; descripcion: unknown }>,
  ): LocalResponseDto {
    const tieneEmpresa = Boolean(row.id_empresa);
    const empresaNombre = row.id_empresa ? (mapEmpresas.get(row.id_empresa) as string) ?? null : null;
    const centro = row.id_centro_costo ? mapCentros.get(row.id_centro_costo) : null;

    return {
      id: row.id,
      codigo: String(row.codigo),
      nombre: String(row.nombre),
      direccion: row.direccion ? String(row.direccion) : null,
      id_empresa: row.id_empresa,
      empresa_nombre: empresaNombre,
      id_centro_costo: row.id_centro_costo,
      centro_costo_codigo: centro ? String(centro.codigo) : null,
      centro_costo_nombre: centro ? String(centro.descripcion) : null,
      tipo_asignacion: tieneEmpresa ? 'EMPRESA' : 'CENTRO_COSTO',
      estado: row.estado,
    };
  }
}
