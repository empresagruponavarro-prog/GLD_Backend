import { Test } from '@nestjs/testing';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { CentroCostoController } from './centro-costo.controller.js';
import { CentroCostoHandler } from './centro-costo.handler.js';

function ccRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    CodCentroCto: 'CC-2026-001',
    CodEmpresa: 'E1',
    IdPeriodo: '2026',
    CodCliente: 'A1',
    CodCentroCtoPrincipal: null,
    CentroCosto: 'Proyecto Edificio',
    Estado: 'ABIERTO',
    FechaIncio: null,
    FechaFinProg: null,
    FechaFinReal: null,
    PresupuestoEstado: 'Aprobado',
    PresupuestoCostoDirecto: null,
    PresupuestoGastosGenerales: null,
    PresupuestoViaticos: null,
    PresupuestoMonto: '1450000.00',
    OCFile: null,
    ...overrides,
  };
}

describe('centro-costo', () => {
  let controller: CentroCostoController;
  const centroAll = vi.fn();
  const centroFirst = vi.fn();
  const empresasAll = vi.fn();
  const anexosAll = vi.fn();
  const pptoAggregate = vi.fn();
  const docCompraAggregate = vi.fn();
  const docCompraAll = vi.fn();
  const cajaAggregate = vi.fn();
  const egresosAggregate = vi.fn();
  const planillaAggregate = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();

    const dbMock = {
      orm: {
        public: {
          CentroCostos: {
            orderBy: vi.fn(() => ({ all: centroAll })),
            first: centroFirst,
            all: centroAll,
          },
          Empresas: { all: empresasAll },
          Anexos: { all: anexosAll },
          ppto_Principal: { where: vi.fn(() => ({ aggregate: pptoAggregate })) },
          DocCompra: {
            where: vi.fn(() => ({
              aggregate: docCompraAggregate,
              all: docCompraAll,
            })),
          },
          CajaEgresosRetail: { where: vi.fn(() => ({ aggregate: cajaAggregate })) },
          Egresos_DocCompra: { aggregate: egresosAggregate, where: vi.fn(() => ({ aggregate: egresosAggregate })) },
          PlanillaPago: { aggregate: planillaAggregate, where: vi.fn(() => ({ aggregate: planillaAggregate })) },
        },
      },
    } as unknown as Database;

    const moduleRef = await Test.createTestingModule({
      controllers: [CentroCostoController],
      providers: [CentroCostoHandler, { provide: DB, useValue: dbMock }],
    }).compile();

    controller = moduleRef.get(CentroCostoController);
  });

  it('lista centros de costos componiendo empresa y cliente', async () => {
    centroAll.mockResolvedValue([ccRow()]);
    empresasAll.mockResolvedValue([
      { id: 1, CodEmpresa: 'E1', RazonSocial: 'GLD SERVICIOS GENERALES EIRL' },
    ]);
    anexosAll.mockResolvedValue([{ id: 1, CodigoAnexo: 'A1', Anexo: 'CLIENTE MAYORISTA' }]);

    const result = await controller.findAll({});
    expect(result[0]).toMatchObject({
      CodCentroCto: 'CC-2026-001',
      Empresa: 'GLD SERVICIOS GENERALES EIRL',
      Cliente: 'CLIENTE MAYORISTA',
      PresupuestoMonto: '1450000.00',
    });
  });

  it('aplica el filtro de estado', async () => {
    centroAll.mockResolvedValue([
      ccRow(),
      ccRow({ CodCentroCto: 'CC-2026-002', Estado: 'CERRADO' }),
    ]);
    empresasAll.mockResolvedValue([]);
    anexosAll.mockResolvedValue([]);

    const result = await controller.findAll({ estado: 'CERRADO' });
    expect(result).toHaveLength(1);
    expect(result[0].CodCentroCto).toBe('CC-2026-002');
  });

  it('devuelve el conteo de estados', async () => {
    centroAll.mockResolvedValue([
      ccRow(),
      ccRow({ CodCentroCto: 'CC-2026-002', Estado: 'CERRADO' }),
      ccRow({ CodCentroCto: 'CC-2026-003', Estado: 'ABIERTO' }),
    ]);
    await expect(controller.getConteoEstados()).resolves.toEqual({
      total: 3,
      abiertos: 2,
      cerrados: 1,
    });
  });

  it('devuelve los catálogos de filtros', async () => {
    centroAll.mockResolvedValue([
      ccRow(),
      ccRow({ CodCentroCto: 'CC-2026-002', IdPeriodo: '2025', PresupuestoEstado: 'Pendiente' }),
    ]);
    empresasAll.mockResolvedValue([{ id: 1, CodEmpresa: 'E1', RazonSocial: 'GLD EIRL' }]);
    anexosAll.mockResolvedValue([{ id: 1, CodigoAnexo: 'A1', Anexo: 'CLIENTE A' }]);

    const result = await controller.getCatalogosFiltros();
    expect(result.empresas).toContain('GLD EIRL');
    expect(result.periodos).toEqual(['2026', '2025']);
    expect(result.estados).toEqual(['ABIERTO']);
    expect(result.pptoEstados).toEqual(['Aprobado', 'Pendiente']);
  });

  it('calcula el resumen financiero', async () => {
    pptoAggregate.mockResolvedValue({
      costoDirecto: '100',
      gastosGenerales: '10',
      viaticos: '5',
      totalComercial: '200',
    });
    docCompraAggregate.mockResolvedValue({ totalGastos: '50' });
    cajaAggregate.mockResolvedValue({ totalCaja: '30' });
    docCompraAll.mockResolvedValue([{ id: 1, IdDocCompra: 'DC1' }]);
    egresosAggregate.mockResolvedValue({ totalPagado: '20' });
    planillaAggregate.mockResolvedValue({ totalPlanilla: '10' });
    centroFirst.mockResolvedValue(ccRow());

    const result = await controller.getResumenFinanciero('CC-2026-001');
    expect(result).toMatchObject({
      codCentroCto: 'CC-2026-001',
      presupuestoBase: 115,
      presupuestoComercial: 200,
      gastosAcumulados: 80,
      pagosRealizados: 30,
      saldoActual: 120,
    });
  });
});