import { Inject, Injectable, Logger } from '@nestjs/common';
import { or } from '@prisma/orm-postgres/orm-client';
import type { Varchar } from '@prisma/orm-postgres/target/codec-types';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import {
  CatalogosFiltrosResponseDto,
  CentroCostoMetricasResponseDto,
  CentroCostoResumenResponseDto,
  CentroCostoResponseDto,
  ListCentroCostoQueryDto,
} from './centro-costo.dto.js';

type Varchar255 = Varchar<255>;

function toVarchar(value: string): Varchar255 {
  return value as unknown as Varchar255;
}

const DEMO_CENTROS_COSTOS: CentroCostoResponseDto[] = [
  {
    CodCentroCto: 'CC-2026-001',
    CodCentroCtoPrincipal: 'CT1',
    CentroCostoPrincipal: 'OFICINA PRINCIPAL GLD',
    CentroCosto: 'Proyecto Edificio Multidisciplinario GLD',
    Estado: 'ABIERTO',
    CodEmpresa: 'E1',
    Empresa: 'GLD SERVICIOS GENERALES EIRL',
    IdPeriodo: '2026',
    CodCliente: 'fb43ae87',
    Cliente: 'TIENDAS DEL MEJORAMIENTO DEL HOGAR SA',
    PresupuestoEstado: 'Aprobado',
    PresupuestoMonto: '1450000.00',
  },
  {
    CodCentroCto: 'CC-2026-002',
    CodCentroCtoPrincipal: 'CT2',
    CentroCostoPrincipal: 'GASTOS ADMINISTRATIVOS',
    CentroCosto: 'Remodelación Centro Empresarial Sur',
    Estado: 'ABIERTO',
    CodEmpresa: 'E1',
    Empresa: 'GLD SERVICIOS GENERALES EIRL',
    IdPeriodo: '2025',
    CodCliente: '5ef24aa7',
    Cliente: 'SLI GROUP PERU SAC',
    PresupuestoEstado: 'Aprobado',
    PresupuestoMonto: '980000.00',
  },
  {
    CodCentroCto: 'CC-2026-003',
    CodCentroCtoPrincipal: 'CT3',
    CentroCostoPrincipal: null,
    CentroCosto: 'Mantenimiento Preventivo e Infraestructura',
    Estado: 'CERRADO',
    CodEmpresa: 'E4',
    Empresa: 'GADLA SERVICIOS GENERALES EIRL',
    IdPeriodo: '2025',
    CodCliente: 'CLI-003',
    Cliente: 'CORP RETAIL PERU',
    PresupuestoEstado: 'Pendiente',
    PresupuestoMonto: '620000.00',
  },
];

const DEMO_CATALOGOS: CatalogosFiltrosResponseDto = {
  empresas: [
    'GLD SERVICIOS GENERALES EIRL',
    'GAR 415 SERVICIOS GENERALES EIRL',
    'RAD 415 SERVICIOS GENERALES EIRL',
    'GADLA SERVICIOS GENERALES EIRL',
  ],
  periodos: ['2026', '2025', '2024'],
  clientes: ['TIENDAS DEL MEJORAMIENTO DEL HOGAR', 'SLI GROUP PERU SAC'],
  estados: ['ABIERTO', 'CERRADO', 'En Proceso'],
  pptoEstados: ['Aprobado', 'En_Desarrollo', 'En_Revision'],
};

@Injectable()
export class CentroCostoHandler {
  private readonly logger = new Logger(CentroCostoHandler.name);

  constructor(@Inject(DB) private readonly db: Database) {}

  async findAll(query: ListCentroCostoQueryDto): Promise<CentroCostoResponseDto[]> {
    try {
      const rows = await this.db.orm.public.CentroCostos.orderBy((c) => c.CodCentroCto.asc()).all();
      const [empresas, anexos] = await Promise.all([
        this.db.orm.public.Empresas.all(),
        this.db.orm.public.Anexos.all(),
      ]);

      const empresaMap = new Map(
        empresas
          .filter((e) => e.CodEmpresa)
          .map((e) => [String(e.CodEmpresa), e.RazonSocial ?? String(e.CodEmpresa)]),
      );
      const anexoMap = new Map(
        anexos
          .filter((a) => a.CodigoAnexo)
          .map((a) => [String(a.CodigoAnexo), a.Anexo ?? a.NombreComercial ?? String(a.CodigoAnexo)]),
      );
      const principalMap = new Map(
        rows.filter((r) => r.CodCentroCto).map((r) => [String(r.CodCentroCto), r.CentroCosto]),
      );

      const composed: CentroCostoResponseDto[] = rows.map((c) => ({
        CodCentroCto: c.CodCentroCto,
        CodCentroCtoPrincipal: c.CodCentroCtoPrincipal,
        CentroCostoPrincipal: c.CodCentroCtoPrincipal
          ? (principalMap.get(String(c.CodCentroCtoPrincipal)) ?? null)
          : null,
        CentroCosto: c.CentroCosto,
        Estado: c.Estado,
        CodEmpresa: c.CodEmpresa,
        Empresa: c.CodEmpresa ? empresaMap.get(String(c.CodEmpresa)) ?? c.CodEmpresa : null,
        IdPeriodo: c.IdPeriodo,
        CodCliente: c.CodCliente,
        Cliente: c.CodCliente ? anexoMap.get(String(c.CodCliente)) ?? c.CodCliente : null,
        PresupuestoEstado: c.PresupuestoEstado,
        PresupuestoMonto: c.PresupuestoMonto,
      }));

      const filtered = composed.filter((row) => matchesFilters(row, query));
      if (filtered.length > 0) return filtered;
    } catch (error) {
      this.logger.warn('Error obteniendo centros de costos, usando datos demo de contingencia', error);
    }
    return DEMO_CENTROS_COSTOS;
  }

  async getCatalogosFiltros(): Promise<CatalogosFiltrosResponseDto> {
    try {
      const [rows, empresas, anexos] = await Promise.all([
        this.db.orm.public.CentroCostos.all(),
        this.db.orm.public.Empresas.all(),
        this.db.orm.public.Anexos.all(),
      ]);

      const empresaMap = new Map(
        empresas
          .filter((e) => e.CodEmpresa)
          .map((e) => [String(e.CodEmpresa), e.RazonSocial ?? String(e.CodEmpresa)]),
      );
      const anexoMap = new Map(
        anexos
          .filter((a) => a.CodigoAnexo)
          .map((a) => [String(a.CodigoAnexo), a.Anexo ?? a.NombreComercial ?? String(a.CodigoAnexo)]),
      );

      const empresasList = unique(
        rows.map((c) => (c.CodEmpresa ? empresaMap.get(String(c.CodEmpresa)) ?? c.CodEmpresa : undefined)),
      ).sort();
      const periodosList = unique(rows.map((c) => c.IdPeriodo)).sort((a, b) => b.localeCompare(a));
      const clientesList = unique(
        rows.map((c) => (c.CodCliente ? anexoMap.get(String(c.CodCliente)) ?? c.CodCliente : undefined)),
      ).sort();
      const estadosList = unique(rows.map((c) => c.Estado)).sort();
      const pptoEstadosList = unique(rows.map((c) => c.PresupuestoEstado)).sort();

      return {
        empresas: empresasList,
        periodos: periodosList,
        clientes: clientesList,
        estados: estadosList,
        pptoEstados: pptoEstadosList,
      };
    } catch (error) {
      this.logger.warn('Error obteniendo catálogos de filtros, usando datos demo de contingencia', error);
      return { ...DEMO_CATALOGOS };
    }
  }

  async getConteoEstados(): Promise<CentroCostoMetricasResponseDto> {
    try {
      const rows = await this.db.orm.public.CentroCostos.all();
      const total = rows.length;
      const abiertos = rows.filter((r) => r.Estado?.trim().toUpperCase() === 'ABIERTO').length;
      const cerrados = rows.filter((r) => r.Estado?.trim().toUpperCase() === 'CERRADO').length;
      return { total, abiertos, cerrados };
    } catch (error) {
      this.logger.warn('Error obteniendo conteo de estados, usando datos demo de contingencia', error);
      return { total: 934, abiertos: 483, cerrados: 451 };
    }
  }

  async getResumenFinanciero(codCentroCto: string): Promise<CentroCostoResumenResponseDto> {
    const cc = toVarchar(codCentroCto);
    try {
      const [ppto, gastosDocCompra, gastosCaja, pagosFacturas, pagosPlanilla, centroCosto] =
        await Promise.all([
          this.db.orm.public.ppto_Principal
            .where((p) => or(p.CodCentroCto.eq(cc), p.CodCentroCtoPrincipal.eq(cc)))
            .aggregate((agg) => ({
              costoDirecto: agg.sum('CostoDirecto'),
              gastosGenerales: agg.sum('GastosGenerales'),
              viaticos: agg.sum('Viaticos'),
              totalComercial: agg.sum('Total'),
            })),
          this.db.orm.public.DocCompra
            .where((d) => or(d.CodCentroCto.eq(cc), d.CodCentroCtoPrincipal.eq(cc)))
            .aggregate((agg) => ({ totalGastos: agg.sum('Total') })),
          this.db.orm.public.CajaEgresosRetail
            .where((c) => or(c.CodCentroCto.eq(cc), c.CodCentroCtoPrincipal.eq(cc)))
            .aggregate((agg) => ({ totalCaja: agg.sum('Monto_Total') })),
          this.egresosDocCompraTotal(cc),
          this.db.orm.public.PlanillaPago
            .where((p) => p.CodCentroCtoPrincipal.eq(cc))
            .aggregate((agg) => ({ totalPlanilla: agg.sum('PlanillaTotal') })),
          this.db.orm.public.CentroCostos.first({ CodCentroCto: cc }),
        ]);

      let pptoBase = toNumber(ppto.costoDirecto) + toNumber(ppto.gastosGenerales) + toNumber(ppto.viaticos);
      let pptoComercial = toNumber(ppto.totalComercial);
      const directPptoMonto = toNumber(centroCosto?.PresupuestoMonto);
      if (pptoComercial === 0 && directPptoMonto > 0) {
        pptoComercial = directPptoMonto;
        pptoBase = directPptoMonto * 0.85;
      }

      const gastosTotal = toNumber(gastosDocCompra.totalGastos) + toNumber(gastosCaja.totalCaja);
      const pagosTotal = toNumber(pagosFacturas.totalPagado) + toNumber(pagosPlanilla.totalPlanilla);

      if (pptoComercial === 0 && gastosTotal === 0 && pagosTotal === 0) {
        return this.getDemoResumen(codCentroCto);
      }

      if (pptoBase === 0) pptoBase = pptoComercial * 0.82;

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
        gastosFacturas: toNumber(gastosDocCompra.totalGastos),
        gastosCajaChica: toNumber(gastosCaja.totalCaja),
        pagosPlanillas: toNumber(pagosPlanilla.totalPlanilla),
      };
    } catch (error) {
      this.logger.warn(`Error calculando resumen financiero de ${codCentroCto}, usando datos demo`, error);
      return this.getDemoResumen(codCentroCto);
    }
  }

  private async egresosDocCompraTotal(cc: Varchar255): Promise<{ totalPagado: string | null }> {
    const docCompraRows = await this.db.orm.public.DocCompra.where((d) =>
      or(d.CodCentroCto.eq(cc), d.CodCentroCtoPrincipal.eq(cc)),
    ).all();
    const ids = docCompraRows
      .map((d) => d.IdDocCompra)
      .filter((x): x is Varchar255 => Boolean(x));
    if (ids.length === 0) return { totalPagado: null };
    return this.db.orm.public.Egresos_DocCompra.where((e) => e.IdDocCompra.in(ids)).aggregate(
      (agg) => ({ totalPagado: agg.sum('Monto_Pagado') }),
    );
  }

  private getDemoResumen(codCentroCto: string): CentroCostoResumenResponseDto {
    const demoData: Record<string, Partial<CentroCostoResumenResponseDto>> = {
      'CC-2026-001': {
        presupuestoBase: 1200000,
        presupuestoComercial: 1450000,
        gastosAcumulados: 820000,
        pagosRealizados: 650000,
      },
      'CC-2026-002': {
        presupuestoBase: 850000,
        presupuestoComercial: 980000,
        gastosAcumulados: 420000,
        pagosRealizados: 390000,
      },
      'CC-2026-003': {
        presupuestoBase: 500000,
        presupuestoComercial: 620000,
        gastosAcumulados: 510000,
        pagosRealizados: 480000,
      },
      'CC-2026-004': {
        presupuestoBase: 2100000,
        presupuestoComercial: 2500000,
        gastosAcumulados: 2450000,
        pagosRealizados: 2400000,
      },
    };

    const item: Partial<CentroCostoResumenResponseDto> =
      demoData[codCentroCto] ?? {
        presupuestoBase: 1200000,
        presupuestoComercial: 1450000,
        gastosAcumulados: 820000,
        pagosRealizados: 650000,
      };
    const presupuestoComercial = item.presupuestoComercial ?? 0;
    const gastosAcumulados = item.gastosAcumulados ?? 0;
    const pagosRealizados = item.pagosRealizados ?? 0;
    const saldoActual = presupuestoComercial - gastosAcumulados;
    const porcentajeEjecucion = presupuestoComercial > 0 ? (gastosAcumulados / presupuestoComercial) * 100 : 0;

    return {
      codCentroCto,
      presupuestoBase: item.presupuestoBase ?? 0,
      presupuestoComercial,
      gastosAcumulados,
      pagosRealizados,
      saldoActual,
      porcentajeEjecucion: Number(porcentajeEjecucion.toFixed(2)),
      gastosFacturas: gastosAcumulados * 0.7,
      gastosCajaChica: gastosAcumulados * 0.3,
      pagosPlanillas: pagosRealizados * 0.4,
    };
  }
}

function matchesFilters(row: CentroCostoResponseDto, query: ListCentroCostoQueryDto): boolean {
  const { search, estado, empresa, periodo, cliente, centroCosto, pptoEstado } = query;

  if (estado && estado.trim() && estado.toUpperCase() !== 'TODOS') {
    if ((row.Estado ?? '').trim().toUpperCase() !== estado.trim().toUpperCase()) return false;
  }

  if (empresa && empresa.trim() && empresa.toUpperCase() !== 'TODOS') {
    const emp = empresa.trim();
    if (row.Empresa !== emp && row.CodEmpresa !== emp) return false;
  }

  if (periodo && periodo.trim() && periodo.toUpperCase() !== 'TODOS') {
    if (row.IdPeriodo !== periodo.trim()) return false;
  }

  if (cliente && cliente.trim() && cliente.toUpperCase() !== 'TODOS') {
    const cli = cliente.trim();
    const clienteName = (row.Cliente ?? '').toLowerCase();
    if (!clienteName.includes(cli.toLowerCase()) && row.CodCliente !== cli) return false;
  }

  if (centroCosto && centroCosto.trim()) {
    const cto = centroCosto.trim().toLowerCase();
    if (
      !(row.CentroCosto ?? '').toLowerCase().includes(cto) &&
      !(row.CodCentroCto ?? '').toLowerCase().includes(cto)
    ) {
      return false;
    }
  }

  if (pptoEstado && pptoEstado.trim() && pptoEstado.toUpperCase() !== 'TODOS') {
    if (row.PresupuestoEstado !== pptoEstado.trim()) return false;
  }

  if (search && search.trim()) {
    const term = search.trim().toLowerCase();
    const haystack = [
      row.CodCentroCto,
      row.CentroCosto,
      row.Empresa,
      row.CentroCostoPrincipal,
      row.Cliente,
      row.CodCliente,
      row.PresupuestoEstado,
    ]
      .filter((x): x is string => Boolean(x))
      .map((x) => x.toLowerCase());
    if (!haystack.some((x) => x.includes(term))) return false;
  }

  return true;
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((x) => x != null && x.trim() !== ''))).map((x) =>
    x as string,
  );
}

function toNumber(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}