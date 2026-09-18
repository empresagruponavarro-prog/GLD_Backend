import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
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
      const [rows, empresas, principales, pptos, detalleFases] = await Promise.all([
        this.db.orm.public.CentroCostos.orderBy((c) => c.id.desc()).all(),
        this.db.orm.public.Empresas.all(),
        this.db.orm.public.centro_costos_principal.all(),
        this.db.orm.public.ppto_Principal.all(),
        this.db.orm.public.ppto_DetalleFases.all(),
      ]);

      const empresasById = new Map(empresas.map((e) => [e.id_empresa, e.razon_social]));
      const principalesByRowId = new Map(principales.map((p) => [p.id, p]));

      // Map CostoDirecto from ppto_DetalleFases
      const fasesByPpto = new Map<string, number>();
      const fasesByCC = new Map<number, number>();
      for (const f of detalleFases) {
        const monto = Number(f.CostoDirecto) || 0;
        if (f.IdPresupuesto) {
          const prev = fasesByPpto.get(String(f.IdPresupuesto)) ?? 0;
          fasesByPpto.set(String(f.IdPresupuesto), prev + monto);
        }
        if (f.id_centro_costo != null) {
          const prev = fasesByCC.get(f.id_centro_costo) ?? 0;
          fasesByCC.set(f.id_centro_costo, prev + monto);
        }
      }

      // Map CostoDirecto and Estado by CC
      const pptoMontoByCC = new Map<number, number>();
      const pptoEstadoByCC = new Map<number, string>();

      for (const p of pptos) {
        const pptoCode = p.IdPresupuesto ? String(p.IdPresupuesto) : '';
        const cdPrincipal = Number(p.CostoDirecto) || 0;
        const cdFases = pptoCode ? (fasesByPpto.get(pptoCode) ?? 0) : 0;
        const cdReal = Math.max(cdPrincipal, cdFases);

        if (p.id_centro_costo != null) {
          const prev = pptoMontoByCC.get(p.id_centro_costo) ?? 0;
          pptoMontoByCC.set(p.id_centro_costo, prev + cdReal);
          if (p.Estado) pptoEstadoByCC.set(p.id_centro_costo, p.Estado);
        }
      }

      for (const [ccId, fasesMonto] of fasesByCC.entries()) {
        const current = pptoMontoByCC.get(ccId) ?? 0;
        if (fasesMonto > current) {
          pptoMontoByCC.set(ccId, fasesMonto);
        }
      }

      const empresaDelHijo = (r: { id_centro_costos_principal: number | null }): number | null => {
        const principal = r.id_centro_costos_principal != null ? principalesByRowId.get(r.id_centro_costos_principal) : null;
        return principal?.id_empresa ?? null;
      };

      return rows
        .map((r) => {
          const idEmpresa = empresaDelHijo(r);
          const codCliente = r.cod_cliente;
          const idPrincipal = r.id_centro_costos_principal;
          const principalName = idPrincipal != null ? principalesByRowId.get(idPrincipal)?.descripcion ?? null : null;

          const pptoCalculado = pptoMontoByCC.get(r.id);
          const pptoMonto = pptoCalculado !== undefined && pptoCalculado > 0
            ? String(pptoCalculado)
            : (r.presupuesto_costo_directo != null && Number(r.presupuesto_costo_directo) > 0
                ? String(r.presupuesto_costo_directo)
                : (r.presupuesto_monto != null ? String(r.presupuesto_monto) : '0.00'));

          const pptoEstado = pptoEstadoByCC.get(r.id) || r.presupuesto_estado || 'ABIERTO';

          return {
            id: r.id,
            idCentroCostosPrincipal: idPrincipal,
            CentroCostoPrincipal: principalName,
            CentroCosto: r.centro_costo,
            Estado: r.estado ?? 'ABIERTO',
            id_empresa: idEmpresa,
            Empresa: idEmpresa != null ? empresasById.get(idEmpresa) ?? null : null,
            periodo: r.periodo,
            CodCliente: r.cod_cliente,
            Cliente: codCliente,
            PresupuestoEstado: pptoEstado,
            PresupuestoMonto: pptoMonto,
            FechaIncio: r.fecha_inicio,
            FechaFinProg: r.fecha_fin_prog,
            FechaFinReal: r.fecha_fin_real,
          };
        })
        .filter((r) => matchesFilters(r, query));
    } catch (error) {
      this.logger.error('Error listando centros de costos', error);
      throw error;
    }
  }

  async getById(id: number): Promise<CentroCostoResponseDto> {
    const [row, pptos, fases] = await Promise.all([
      this.db.orm.public.CentroCostos.first({ id }),
      this.db.orm.public.ppto_Principal.where((p) => p.id_centro_costo.eq(id)).all(),
      this.db.orm.public.ppto_DetalleFases.where((f) => f.id_centro_costo.eq(id)).all(),
    ]);

    if (!row) throw new NotFoundException(`Centro de costo ${id} no encontrado`);
    const totalPptoCd = pptos.reduce((acc, p) => acc + (Number(p.CostoDirecto) || 0), 0);
    const totalFasesCd = fases.reduce((acc, f) => acc + (Number(f.CostoDirecto) || 0), 0);
    const totalCd = Math.max(totalPptoCd, totalFasesCd);

    const pptoMonto = totalCd > 0
      ? String(totalCd)
      : (row.presupuesto_costo_directo != null && Number(row.presupuesto_costo_directo) > 0
          ? String(row.presupuesto_costo_directo)
          : (row.presupuesto_monto != null ? String(row.presupuesto_monto) : '0.00'));
    const pptoEstado = pptos.find((p) => p.Estado)?.Estado || row.presupuesto_estado || 'ABIERTO';

    return {
      id: row.id,
      idCentroCostosPrincipal: row.id_centro_costos_principal,
      CentroCosto: row.centro_costo,
      Estado: row.estado,
      id_empresa: null,
      periodo: row.periodo,
      CodCliente: row.cod_cliente,
      PresupuestoEstado: pptoEstado,
      PresupuestoMonto: pptoMonto,
      FechaIncio: row.fecha_inicio,
      FechaFinProg: row.fecha_fin_prog,
      FechaFinReal: row.fecha_fin_real,
    };
  }

  async create(dto: CreateCentroCostoDto): Promise<CentroCostoResponseDto> {
    const created = await this.db.orm.public.CentroCostos.create({
      periodo: dto.periodo,
      cod_cliente: toVarchar(dto.CodCliente),
      id_centro_costos_principal: dto.id_centro_costos_principal,
      centro_costo: toVarchar(dto.CentroCosto),
      estado: toVarchar<50>(dto.Estado ?? 'ABIERTO'),
      fecha_inicio: toDateString(dto.FechaIncio),
      fecha_fin_prog: toDateString(dto.FechaFinProg),
      fecha_fin_real: toDateString(dto.FechaFinReal),
      presupuesto_estado: toVarchar<50>(dto.PresupuestoEstado),
      presupuesto_costo_directo: toDecimalString(dto.PresupuestoCostoDirecto ?? 0),
      presupuesto_gastos_generales: toDecimalString(dto.PresupuestoGastosGenerales ?? 0),
      presupuesto_viaticos: toDecimalString(dto.PresupuestoViaticos ?? 0),
      presupuesto_monto: toDecimalString(dto.PresupuestoMonto ?? 0),
      oc_file: toVarchar(dto.OCFile),
    });

    return {
      id: created.id,
      idCentroCostosPrincipal: created.id_centro_costos_principal,
      CentroCosto: created.centro_costo,
      Estado: created.estado,
      id_empresa: null,
      periodo: created.periodo,
      CodCliente: created.cod_cliente,
      PresupuestoEstado: created.presupuesto_estado,
      PresupuestoMonto: created.presupuesto_monto != null ? String(created.presupuesto_monto) : null,
    };
  }

  async update(id: number, dto: UpdateCentroCostoDto): Promise<CentroCostoResponseDto> {
    const current = await this.db.orm.public.CentroCostos.first({ id });
    if (!current) throw new NotFoundException(`Centro de costo ${id} no encontrado`);
    const data: {
      periodo?: number;
      cod_cliente?: Varchar255;
      id_centro_costos_principal?: number;
      centro_costo?: Varchar255;
      estado?: Varchar50;
      fecha_inicio?: string;
      fecha_fin_prog?: string;
      fecha_fin_real?: string;
      presupuesto_estado?: Varchar50;
      presupuesto_costo_directo?: string;
      presupuesto_gastos_generales?: string;
      presupuesto_viaticos?: string;
      presupuesto_monto?: string;
      oc_file?: Varchar255;
    } = {};

    if (dto.periodo !== undefined) data.periodo = dto.periodo;
    if (dto.CodCliente !== undefined) data.cod_cliente = toVarchar(dto.CodCliente);
    if (dto.id_centro_costos_principal !== undefined)
      data.id_centro_costos_principal = dto.id_centro_costos_principal;
    if (dto.CentroCosto !== undefined) data.centro_costo = toVarchar(dto.CentroCosto);
    if (dto.Estado !== undefined) data.estado = toVarchar<50>(dto.Estado);
    if (dto.FechaIncio !== undefined) data.fecha_inicio = toDateString(dto.FechaIncio);
    if (dto.FechaFinProg !== undefined) data.fecha_fin_prog = toDateString(dto.FechaFinProg);
    if (dto.FechaFinReal !== undefined) data.fecha_fin_real = toDateString(dto.FechaFinReal);
    if (dto.PresupuestoEstado !== undefined) data.presupuesto_estado = toVarchar<50>(dto.PresupuestoEstado);
    if (dto.PresupuestoCostoDirecto !== undefined) data.presupuesto_costo_directo = toDecimalString(dto.PresupuestoCostoDirecto);
    if (dto.PresupuestoGastosGenerales !== undefined) data.presupuesto_gastos_generales = toDecimalString(dto.PresupuestoGastosGenerales);
    if (dto.PresupuestoViaticos !== undefined) data.presupuesto_viaticos = toDecimalString(dto.PresupuestoViaticos);
    if (dto.PresupuestoMonto !== undefined) data.presupuesto_monto = toDecimalString(dto.PresupuestoMonto);
    if (dto.OCFile !== undefined) data.oc_file = toVarchar(dto.OCFile);

    const row = await this.db.orm.public.CentroCostos.where({ id }).update(data);
    if (!row) throw new NotFoundException(`Centro de costo ${id} no encontrado`);
    return {
      id: row.id,
      idCentroCostosPrincipal: row.id_centro_costos_principal,
      CentroCosto: row.centro_costo,
      Estado: row.estado,
      id_empresa: null,
      periodo: row.periodo,
      CodCliente: row.cod_cliente,
      PresupuestoEstado: row.presupuesto_estado,
      PresupuestoMonto: row.presupuesto_monto != null ? String(row.presupuesto_monto) : null,
    };
  }

  async remove(id: number): Promise<{ deleted: boolean; id: number }> {
    const current = await this.db.orm.public.CentroCostos.first({ id });
    if (!current) throw new NotFoundException(`Centro de costo ${id} no encontrado`);
    await this.db.orm.public.CentroCostos.where({ id: current.id }).delete();
    return { deleted: true, id: current.id };
  }

  async getPresupuestos(id: number) {
    const cc = await this.db.orm.public.CentroCostos.first({ id });
    if (!cc) return [];
    return this.db.orm.public.ppto_Principal
      .where((p) => p.id_centro_costo.eq(cc.id))
      .all();
  }

  async getPrincipales() {
    const [principales, empresas] = await Promise.all([
      this.db.orm.public.centro_costos_principal.orderBy((p) => p.descripcion.asc()).all(),
      this.db.orm.public.Empresas.all(),
    ]);

    const empresasById = new Map(empresas.map((e) => [e.id_empresa, e.razon_social]));

    return principales.map((p) => ({
      id: p.id,
      centro_costo_principal: p.centro_costo_principal,
      descripcion: p.descripcion,
      estado: p.estado ?? 'ABIERTO',
      id_empresa: p.id_empresa,
      Empresa: p.id_empresa != null ? empresasById.get(p.id_empresa) ?? null : null,
    }));
  }

  async getCatalogosFiltros(): Promise<CatalogosFiltrosResponseDto> {
    const [rows, empresas, principales] = await Promise.all([
      this.db.orm.public.CentroCostos.all(),
      this.db.orm.public.Empresas.all(),
      this.db.orm.public.centro_costos_principal.all(),
    ]);

    const empresasById = new Map(empresas.map((e) => [e.id_empresa, e.razon_social]));
    const empresasByPrincipalId = new Map(principales.map((p) => [p.id, p.id_empresa]));
    const idEmpresas = new Set(
      rows
        .map((r) => (r.id_centro_costos_principal != null ? empresasByPrincipalId.get(r.id_centro_costos_principal) ?? null : null))
        .filter((e) => e != null) as number[],
    );

    return {
      empresas: unique([...idEmpresas].map((e) => empresasById.get(e) ?? null)),
      periodos: unique(rows.map((r) => r.periodo)),
      clientes: unique(rows.map((r) => r.cod_cliente)),
      estados: unique(rows.map((r) => r.estado)),
      pptoEstados: unique(rows.map((r) => r.presupuesto_estado)),
    };
  }

  async getConteoEstados(): Promise<CentroCostoMetricasResponseDto> {
    const rows = await this.db.orm.public.CentroCostos.all();
    const total = rows.length;
    const abiertos = rows.filter((r) => r.estado?.trim().toUpperCase() === 'ABIERTO').length;
    const cerrados = rows.filter((r) => r.estado?.trim().toUpperCase() === 'CERRADO').length;
    return { total, abiertos, cerrados };
  }

  async getResumenFinanciero(id: number): Promise<CentroCostoResumenResponseDto> {
    try {
      const centroCosto = await this.db.orm.public.CentroCostos.first({ id });
      if (!centroCosto) {
        return {
          id,
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
      const [ppto, docCompra, caja, egresos, planilla] = await Promise.all([
        this.db.orm.public.ppto_Principal
          .where((p) => p.id_centro_costo.eq(id))
          .aggregate((agg) => ({
            costoDirecto: agg.sum('CostoDirecto'),
            gastosGenerales: agg.sum('GastosGenerales'),
            viaticos: agg.sum('Viaticos'),
            totalComercial: agg.sum('Total'),
          })),
        this.db.orm.public.DocCompra.where((d) => d.id_centro_costo.eq(id)).aggregate((agg) => ({
          totalGastos: agg.sum('Total'),
        })),
        this.db.orm.public.CajaEgresosRetail.where((c) => c.id_centro_costo.eq(id)).aggregate((agg) => ({
          totalCaja: agg.sum('Monto_Total'),
        })),
        this.db.orm.public.Egresos_DocCompra.aggregate((agg) => ({
          totalPagado: agg.sum('Monto_Pagado'),
        })),
        this.db.orm.public.PlanillaPago.aggregate((agg) => ({
          totalPlanilla: agg.sum('PlanillaTotal'),
        })),
      ]);

      let pptoBase = toNumber(ppto.costoDirecto) + toNumber(ppto.gastosGenerales) + toNumber(ppto.viaticos);
      let pptoComercial = toNumber(ppto.totalComercial);
      const directPptoMonto = toNumber(centroCosto.presupuesto_monto);
      if (pptoComercial === 0 && directPptoMonto > 0) {
        pptoComercial = directPptoMonto;
        pptoBase = directPptoMonto * 0.85;
      }

      const gastosFacturas = toNumber(docCompra.totalGastos);
      const gastosCajaChica = toNumber(caja.totalCaja);
      const gastosTotal = gastosFacturas + gastosCajaChica;
      const pagosPlanillas = toNumber(planilla.totalPlanilla);
      const pagosTotal = toNumber(egresos.totalPagado) + pagosPlanillas;
      const saldoActual = pptoComercial - gastosTotal;
      const porcentajeEjecucion = pptoComercial > 0 ? (gastosTotal / pptoComercial) * 100 : 0;

      return {
        id,
        presupuestoBase: pptoBase,
        presupuestoComercial: pptoComercial,
        gastosAcumulados: gastosTotal,
        pagosRealizados: pagosTotal,
        saldoActual,
        porcentajeEjecucion: Number(porcentajeEjecucion.toFixed(2)),
        gastosFacturas,
        gastosCajaChica,
        pagosPlanillas,
      };
    } catch (error) {
      this.logger.warn(`Error calculando resumen financiero de ${id}`, error);
      return {
        id,
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
    const empMatches = row.Empresa === emp || (row.id_empresa != null && String(row.id_empresa) === emp);
    if (!empMatches) return false;
  }
  if (periodo && periodo.trim() && periodo.toUpperCase() !== 'TODOS') {
    if (row.periodo !== Number(periodo.trim())) return false;
  }
  if (cliente && cliente.trim() && cliente.toUpperCase() !== 'TODOS') {
    const cli = cliente.trim();
    const cliMatches = row.CodCliente === cli || row.Cliente === cli;
    if (!cliMatches) return false;
  }
  if (centroCosto && centroCosto.trim()) {
    const cto = centroCosto.trim().toLowerCase();
    if (!(row.CentroCosto ?? '').toLowerCase().includes(cto)) {
      return false;
    }
  }
  if (pptoEstado && pptoEstado.trim() && pptoEstado.toUpperCase() !== 'TODOS') {
    const filterNorm = normalizePptoEstado(pptoEstado);
    const rowNorm = normalizePptoEstado(row.PresupuestoEstado);
    if (rowNorm !== filterNorm) return false;
  }
  if (search && search.trim()) {
    const term = search.trim().toLowerCase();
    const haystack = [
      row.id != null ? String(row.id) : null,
      (row as any).CodCentroCto != null ? String((row as any).CodCentroCto) : null,
      row.CentroCosto,
      row.id_empresa != null ? String(row.id_empresa) : null,
      row.Empresa,
      row.CodCliente,
      row.Cliente,
      row.PresupuestoEstado,
    ]
      .filter((x): x is string => Boolean(x))
      .map((x) => x.toLowerCase());
    if (!haystack.some((x) => x.includes(term))) return false;
  }

  return true;
}

function unique<T>(values: Array<T | null | undefined>): T[] {
  return Array.from(
    new Set(values.filter((x): x is T => x != null && (typeof x !== 'string' || x.trim() !== ''))),
  );
}

function toNumber(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

function normalizePptoEstado(val: string | null | undefined): string {
  if (!val) return '';
  return val.trim().toLowerCase().replace(/[\s_\-]+/g, '');
}
// Convierte string vacío o null/undefined a undefined para campos date de PostgreSQL
function toDateString(val: string | null | undefined): string | undefined {
  if (!val || val.trim() === '') return undefined;
  return val.trim();
}

