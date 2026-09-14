import {
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Varchar } from '@prisma/orm-postgres/target/codec-types';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import {
  CreateEmpresaDto,
  EmpresaResponseDto,
  UpdateEmpresaDto,
} from './empresa.dto.js';

type Varchar255 = Varchar<255>;

function toVarchar(value: string): Varchar255;
function toVarchar(value: string | undefined): Varchar255 | undefined;
function toVarchar(value: string | null | undefined): Varchar255 | null | undefined;
function toVarchar(value: string | null | undefined): Varchar255 | null | undefined {
  return value as unknown as Varchar255;
}

@Injectable()
export class EmpresaHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(): Promise<EmpresaResponseDto[]> {
    return this.db.orm.public.Empresas.orderBy((e) => e.id_empresa.asc()).all();
  }

  async getById(id: number): Promise<EmpresaResponseDto> {
    if (!Number.isInteger(id)) {
      throw new NotFoundException(`Empresa con id ${id} no encontrada`);
    }
    const row = await this.db.orm.public.Empresas.first({ id_empresa: id });
    if (!row) {
      throw new NotFoundException(`Empresa con id ${id} no encontrada`);
    }
    return row;
  }

  async create(dto: CreateEmpresaDto): Promise<EmpresaResponseDto> {
    return this.db.orm.public.Empresas.create({
      ruc: toVarchar(dto.ruc),
      razon_social: toVarchar(dto.razon_social),
      domicilio_fiscal: toVarchar(dto.domicilio_fiscal),
      direccion_entrega: toVarchar(dto.direccion_entrega),
      correo_compras: toVarchar(dto.correo_compras),
    });
  }

  async update(id: number, dto: UpdateEmpresaDto): Promise<EmpresaResponseDto> {
    const updateData: {
      ruc?: Varchar255;
      razon_social?: Varchar255;
      domicilio_fiscal?: Varchar255;
      direccion_entrega?: Varchar255;
      correo_compras?: Varchar255;
    } = {};

    if (dto.ruc !== undefined) updateData.ruc = toVarchar(dto.ruc);
    if (dto.razon_social !== undefined) updateData.razon_social = toVarchar(dto.razon_social);
    if (dto.domicilio_fiscal !== undefined)
      updateData.domicilio_fiscal = toVarchar(dto.domicilio_fiscal);
    if (dto.direccion_entrega !== undefined)
      updateData.direccion_entrega = toVarchar(dto.direccion_entrega);
    if (dto.correo_compras !== undefined)
      updateData.correo_compras = toVarchar(dto.correo_compras);

    const row = await this.db.orm.public.Empresas.where({ id_empresa: id }).update(updateData);

    if (!row) {
      throw new NotFoundException(`Empresa con id ${id} no encontrada`);
    }
    return row;
  }

  async remove(id: number): Promise<void> {
    const row = await this.db.orm.public.Empresas.where({ id_empresa: id }).delete();

    if (!row) {
      throw new NotFoundException(`Empresa con id ${id} no encontrada`);
    }
  }
}