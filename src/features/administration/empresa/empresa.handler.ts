import {
  ConflictException,
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
    return this.db.orm.public.Empresas.orderBy((e) => e.CodEmpresa.asc())
      .where((e) => e.CodEmpresa.isNotNull())
      .all();
  }

  async getById(cod: string): Promise<EmpresaResponseDto> {
    const row = await this.db.orm.public.Empresas.first({
      CodEmpresa: toVarchar(cod),
    });
    if (!row) {
      throw new NotFoundException(`Empresa con código ${cod} no encontrada`);
    }
    return row;
  }

  async create(dto: CreateEmpresaDto): Promise<EmpresaResponseDto> {
    const existing = await this.db.orm.public.Empresas.first({
      CodEmpresa: toVarchar(dto.CodEmpresa),
    });
    if (existing) {
      throw new ConflictException(
        `Ya existe una empresa con el código ${dto.CodEmpresa}`,
      );
    }

    return this.db.orm.public.Empresas.create({
      CodEmpresa: toVarchar(dto.CodEmpresa),
      RUC: toVarchar(dto.RUC),
      RazonSocial: toVarchar(dto.RazonSocial),
      DomicilioFiscal: toVarchar(dto.DomicilioFiscal),
      DireccionEntrega: toVarchar(dto.DireccionEntrega),
      CorreoCompras: toVarchar(dto.CorreoCompras),
    });
  }

  async update(cod: string, dto: UpdateEmpresaDto): Promise<EmpresaResponseDto> {
    const updateData: {
      RUC?: Varchar255;
      RazonSocial?: Varchar255;
      DomicilioFiscal?: Varchar255;
      DireccionEntrega?: Varchar255;
      CorreoCompras?: Varchar255;
    } = {};

    if (dto.RUC !== undefined) updateData.RUC = toVarchar(dto.RUC);
    if (dto.RazonSocial !== undefined) updateData.RazonSocial = toVarchar(dto.RazonSocial);
    if (dto.DomicilioFiscal !== undefined)
      updateData.DomicilioFiscal = toVarchar(dto.DomicilioFiscal);
    if (dto.DireccionEntrega !== undefined)
      updateData.DireccionEntrega = toVarchar(dto.DireccionEntrega);
    if (dto.CorreoCompras !== undefined)
      updateData.CorreoCompras = toVarchar(dto.CorreoCompras);

    const row = await this.db.orm.public.Empresas.where({
      CodEmpresa: toVarchar(cod),
    }).update(updateData);

    if (!row) {
      throw new NotFoundException(`Empresa con código ${cod} no encontrada`);
    }
    return row;
  }

  async remove(cod: string): Promise<void> {
    const row = await this.db.orm.public.Empresas.where({
      CodEmpresa: toVarchar(cod),
    }).delete();

    if (!row) {
      throw new NotFoundException(`Empresa con código ${cod} no encontrada`);
    }
  }
}