import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { throwIfUniqueViolation } from '../../../platform/db/pg-errors.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { toDecimalString, toVarchar, type Varchar255, type Varchar50 } from '../../presupuestos/presupuestos.helpers.js';
import {
  CatalogosFiltrosResponseDto,
  CentroCostoMetricasResponseDto,
  CentroCostoResponseDto,
  CentroCostoResumenResponseDto,
  CreateCentroCostoDto,
  ListCentroCostoQueryDto,
  UpdateCentroCostoDto,
} from './centro-costo.dto.js';

@Injectable()
export class CentroCostoHandler {
  private readonly logger = new Logger(CentroCostoHandler.name);

  constructor(@Inject(DB) private readonly db: Database) {}

  async findAll(query: ListCentroCostoQueryDto): Promise<CentroCostoResponseDto[]> {
    try {
      const rows = await this.db.orm.public.CentroCostos.orderBy((c) => c.CodCentroCto.asc()).all();

      return rows
        .map((r) => ({
          id: r.id,
          CodCentroCto: r.CodCentroCto,
          CodCentroCtoPrincipal: r.CodCentroCtoPrincipal,
          CentroCostoPrincipal: r.CodCentroCtoPrincipal ?? null,
          CentroCosto: r.CentroCosto,
          Estado: r.Estado ?? 'ABIERTO',
          CodEmpresa: r.CodEmpresa,
          Empresa: r.CodEmpresa ?? null,
          IdPeriodo: r.IdPeriodo,
          CodCliente: r.CodCliente,
          Cliente: r.CodCliente ?? null,
          PresupuestoEstado: r.PresupuestoEstado,
          PresupuestoMonto: r.PresupuestoMonto != null ? String(r.PresupuestoMonto) : null,
          FechaIncio: r.FechaIncio,
          FechaFinProg: r.FechaFinProg,
          FechaFinReal: r.FechaFinReal,
        }))
        .filter((r) => matchesFilters(r, query));
    } catch (error) {
      this.logger.error('Error listando centros de costos', error);
      throw error;
    }
  }

  async getById(idOrCode: string | number): Promise<CentroCostoResponseDto> {
    const numId = Number(idOrCode);
    const row = isNaN(numId)
      ? await this.db.orm.public.CentroCostos.first({ CodCentroCto: toVarchar(String(idOrCode)) })
      : await this.db.orm.public.CentroCostos.first({ id: numId });

    if (!row) throw new NotFoundException(`Centro de costo "${idOrCode}" no encontrado`);
    return {
      id: row.id,
      CodCentroCto: row.CodCentroCto,
      CodCentroCtoPrincipal: row.CodCentroCtoPrincipal,
      CentroCosto: row.CentroCosto,
      Estado: row.Estado,
      CodEmpresa: row.CodEmpresa,
      IdPeriodo: row.IdPeriodo,
      CodCliente: row.CodCliente,
      PresupuestoEstado: row.PresupuestoEstado,
      PresupuestoMonto: row.PresupuestoMonto != null ? String(row.PresupuestoMonto) : null,
      FechaIncio: row.FechaIncio,
      FechaFinProg: row.FechaFinProg,
      FechaFinReal: row.FechaFinReal,
    };
  }

  async create(dto: CreateCentroCostoDto): Promise<CentroCostoResponseDto> {
    try {
      const created = await this.db.orm.public.CentroCostos.create({
        CodCentroCto: toVarchar(dto.CodCentroCto),
        CodEmpresa: toVarchar(dto.CodEmpresa),
        IdPeriodo: toVarchar(dto.IdPeriodo),
        CodCliente: toVarchar(dto.CodCliente),
        CodCentroCtoPrincipal: toVarchar(dto.CodCentroCtoPrincipal),
        CentroCosto: toVarchar(dto.CentroCosto),
        Estado: toVarchar<50>(dto.Estado ?? 'ABIERTO'),
        FechaIncio: toVarchar(dto.FechaIncio),
        FechaFinProg: toVarchar(dto.FechaFinProg),
        FechaFinReal: toVarchar(dto.FechaFinReal),
        PresupuestoEstado: toVarchar<50>(dto.PresupuestoEstado),
        PresupuestoCostoDirecto: toDecimalString(dto.PresupuestoCostoDirecto ?? 0),
        PresupuestoGastosGenerales: toDecimalString(dto.PresupuestoGastosGenerales ?? 0),
        PresupuestoViaticos: toDecimalString(dto.PresupuestoViaticos ?? 0),
        PresupuestoMonto: toDecimalString(dto.PresupuestoMonto ?? 0),
        OCFile: toVarchar(dto.OCFile),
      });

      return {
        id: created.id,
        CodCentroCto: created.CodCentroCto,
        CodCentroCtoPrincipal: created.CodCentroCtoPrincipal,
        CentroCosto: created.CentroCosto,
        Estado: created.Estado,
        CodEmpresa: created.CodEmpresa,
        IdPeriodo: created.IdPeriodo,
        CodCliente: created.CodCliente,
        PresupuestoEstado: created.PresupuestoEstado,
        PresupuestoMonto: created.PresupuestoMonto != null ? String(created.PresupuestoMonto) : null,
      };
    } catch (error) {
      throwIfUniqueViolation(error, `El CodCentroCto "${dto.CodCentroCto}" ya existe`);
      throw error;
    }
  }

  async update(idOrCode: string | number, dto: UpdateCentroCostoDto): Promise<CentroCostoResponseDto> {
    const numId = Number(idOrCode);
    const current = isNaN(numId)
      ? await this.db.orm.public.CentroCostos.first({ CodCentroCto: toVarchar(String(idOrCode)) })
      : await this.db.orm.public.CentroCostos.first({ id: numId });
    if (!current) throw new NotFoundException(`Centro de costo "${idOrCode}" no encontrado`);
    const id = current.id;
    const data: {
      CodCentroCto?: Varchar255;
      CodEmpresa?: Varchar255;
      IdPeriodo?: Varchar255;
      CodCliente?: Varchar255;
      CodCentroCtoPrincipal?: Varchar255;
      CentroCosto?: Varchar255;
      Estado?: Varchar50;
      FechaIncio?: Varchar255;
      FechaFinProg?: Varchar255;
      FechaFinReal?: Varchar255;
      PresupuestoEstado?: Varchar50;
      PresupuestoCostoDirecto?: string;
      PresupuestoGastosGenerales?: string;
      PresupuestoViaticos?: string;
      PresupuestoMonto?: string;
      OCFile?: Varchar255;
    } = {};

    if (dto.CodCentroCto !== undefined && dto.CodCentroCto !== current.CodCentroCto) {
      data.CodCentroCto = toVarchar(dto.CodCentroCto);
    }
    if (dto.CodEmpresa !== undefined) data.CodEmpresa = toVarchar(dto.CodEmpresa);
    if (dto.IdPeriodo !== undefined) data.IdPeriodo = toVarchar(dto.IdPeriodo);
    if (dto.CodCliente !== undefined) data.CodCliente = toVarchar(dto.CodCliente);
    if (dto.CodCentroCtoPrincipal !== undefined) data.CodCentroCtoPrincipal = toVarchar(dto.CodCentroCtoPrincipal);
    if (dto.CentroCosto !== undefined) data.CentroCosto = toVarchar(dto.CentroCosto);
    if (dto.Estado !== undefined) data.Estado = toVarchar<50>(dto.Estado);
    if (dto.FechaIncio !== undefined) data.FechaIncio = toVarchar(dto.FechaIncio);
    if (dto.FechaFinProg !== undefined) data.FechaFinProg = toVarchar(dto.FechaFinProg);
    if (dto.FechaFinReal !== undefined) data.FechaFinReal = toVarchar(dto.FechaFinReal);
    if (dto.PresupuestoEstado !== undefined) data.PresupuestoEstado = toVarchar<50>(dto.PresupuestoEstado);
    if (dto.PresupuestoCostoDirecto !== undefined) data.PresupuestoCostoDirecto = toDecimalString(dto.PresupuestoCostoDirecto);
    if (dto.PresupuestoGastosGenerales !== undefined) data.PresupuestoGastosGenerales = toDecimalString(dto.PresupuestoGastosGenerales);
    if (dto.PresupuestoViaticos !== undefined) data.PresupuestoViaticos = toDecimalString(dto.PresupuestoViaticos);
    if (dto.PresupuestoMonto !== undefined) data.PresupuestoMonto = toDecimalString(dto.PresupuestoMonto);
    if (dto.OCFile !== undefined) data.OCFile = toVarchar(dto.OCFile);

    try {
      const row = await this.db.orm.public.CentroCostos.where({ id }).update(data);
      if (!row) throw new NotFoundException(`Centro de costo ${id} no encontrado`);
      return {
        id: row.id,
        CodCentroCto: row.CodCentroCto,
        CodCentroCtoPrincipal: row.CodCentroCtoPrincipal,
        CentroCosto: row.CentroCosto,
        Estado: row.Estado,
        CodEmpresa: row.CodEmpresa,
        IdPeriodo: row.IdPeriodo,
        CodCliente: row.CodCliente,
        PresupuestoEstado: row.PresupuestoEstado,
        PresupuestoMonto: row.PresupuestoMonto != null ? String(row.PresupuestoMonto) : null,
      };
    } catch (error) {
      throwIfUniqueViolation(error, `El CodCentroCto ya existe`);
      throw error;
    }
  }

  async remove(idOrCode: string | number): Promise<{ deleted: boolean; id: number; code: string | null }> {
    const numId = Number(idOrCode);
    const current = isNaN(numId)
      ? await this.db.orm.public.CentroCostos.first({ CodCentroCto: toVarchar(String(idOrCode)) })
      : await this.db.orm.public.CentroCostos.first({ id: numId });
    if (!current) throw new NotFoundException(`Centro de costo "${idOrCode}" no encontrado`);
    await this.db.orm.public.CentroCostos.where({ id: current.id }).delete();
    return { deleted: true, id: current.id, code: current.CodCentroCto };
  }

  async getPresupuestos(codCentroCto: string) {
    return this.db.orm.public.ppto_Principal
      .where((p) => p.CodCentroCto.eq(toVarchar(codCentroCto)))
      .all();
  }

  async getCatalogosFiltros(): Promise<CatalogosFiltrosResponseDto> {
    const rows = await this.db.orm.public.CentroCostos.all();
    return {
      empresas: unique(rows.map((r) => r.CodEmpresa)),
      periodos: unique(rows.map((r) => r.IdPeriodo)),
      clientes: unique(rows.map((r) => r.CodCliente)),
      estados: unique(rows.map((r) => r.Estado)),
      pptoEstados: unique(rows.map((r) => r.PresupuestoEstado)),
    };
  }

  async getConteoEstados(): Promise<CentroCostoMetricasResponseDto> {
    const rows = await this.db.orm.public.CentroCostos.all();
    const total = rows.length;
    const abiertos = rows.filter((r) => r.Estado?.trim().toUpperCase() === 'ABIERTO').length;
    const cerrados = rows.filter((r) => r.Estado?.trim().toUpperCase() === 'CERRADO').length;
    return { total, abiertos, cerrados };
  }

  async getResumenFinanciero(codCentroCto: string): Promise<CentroCostoResumenResponseDto> {
    const cc = toVarchar(codCentroCto);
    try {
      const [ppto, centroCosto] = await Promise.all([
        this.db.orm.public.ppto_Principal
          .where((p) => p.CodCentroCto.eq(cc))
          .aggregate((agg) => ({
            costoDirecto: agg.sum('CostoDirecto'),
            gastosGenerales: agg.sum('GastosGenerales'),
            viaticos: agg.sum('Viaticos'),
            totalComercial: agg.sum('Total'),
          })),
        this.db.orm.public.CentroCostos.first({ CodCentroCto: cc }),
      ]);

      let pptoBase = toNumber(ppto.costoDirecto) + toNumber(ppto.gastosGenerales) + toNumber(ppto.viaticos);
      let pptoComercial = toNumber(ppto.totalComercial);
      const directPptoMonto = toNumber(centroCosto?.PresupuestoMonto);
      if (pptoComercial === 0 && directPptoMonto > 0) {
        pptoComercial = directPptoMonto;
        pptoBase = directPptoMonto * 0.85;
      }

      const gastosTotal = 0;
      const pagosTotal = 0;
      const saldoActual = pptoComercial - gastosTotal;
      const porcentajeEjecucion = pptoComercial > 0 ? (gastosTotal / pptoComercial) * 100 : 0;

      return {
        codCentroCto,
        presupuestoBase: pptoBase,
        presupuestoComercial: pptoComercial,
        gastosAcumulados: gastosTotal,
        pagosRealizados: pagosTotal,
        saldoActual,
        porcentajeEjecucion: Number(porcentajeEjecucion.toFixed(2)),
        gastosFacturas: 0,
        gastosCajaChica: 0,
        pagosPlanillas: 0,
      };
    } catch (error) {
      this.logger.warn(`Error calculando resumen financiero de ${codCentroCto}`, error);
      return {
        codCentroCto,
        presupuestoBase: 0,
        presupuestoComercial: 0,
        gastosAcumulados: 0,
        pagosRealizados: 0,
        saldoActual: 0,
        porcentajeEjecucion: 0,
        gastosFacturas: 0,
        gastosCajaChica: 0,
        pagosPlanillas: 0,
      };
    }
  }
}

function matchesFilters(row: CentroCostoResponseDto, query: ListCentroCostoQueryDto): boolean {
  const { search, estado, empresa, periodo, cliente, centroCosto, pptoEstado } = query;

  if (estado && estado.trim() && estado.toUpperCase() !== 'TODOS') {
    if ((row.Estado ?? '').trim().toUpperCase() !== estado.trim().toUpperCase()) return false;
  }
  if (empresa && empresa.trim() && empresa.toUpperCase() !== 'TODOS') {
    const emp = empresa.trim();
    if (row.CodEmpresa !== emp) return false;
  }
  if (periodo && periodo.trim() && periodo.toUpperCase() !== 'TODOS') {
    if (row.IdPeriodo !== periodo.trim()) return false;
  }
  if (cliente && cliente.trim() && cliente.toUpperCase() !== 'TODOS') {
    const cli = cliente.trim();
    if (row.CodCliente !== cli) return false;
  }
  if (centroCosto && centroCosto.trim()) {
    const cto = centroCosto.trim().toLowerCase();
    if (!(row.CentroCosto ?? '').toLowerCase().includes(cto) && !(row.CodCentroCto ?? '').toLowerCase().includes(cto)) {
      return false;
    }
  }
  if (pptoEstado && pptoEstado.trim() && pptoEstado.toUpperCase() !== 'TODOS') {
    if (row.PresupuestoEstado !== pptoEstado.trim()) return false;
  }
  if (search && search.trim()) {
    const term = search.trim().toLowerCase();
    const haystack = [row.CodCentroCto, row.CentroCosto, row.CodEmpresa, row.CodCliente, row.PresupuestoEstado]
      .filter((x): x is string => Boolean(x))
      .map((x) => x.toLowerCase());
    if (!haystack.some((x) => x.includes(term))) return false;
  }

  return true;
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((x) => x != null && x.trim() !== ''))).map((x) => x as string);
}

function toNumber(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}
