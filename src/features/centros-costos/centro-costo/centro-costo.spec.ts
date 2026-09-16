import { Test } from '@nestjs/testing';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { CentroCostoController } from './centro-costo.controller.js';
import { CentroCostoHandler } from './centro-costo.handler.js';

function ccRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    periodo: 2026,
    cod_cliente: 'A1',
    id_centro_costos_principal: null,
    centro_costo: 'Proyecto Edificio',
    estado: 'ABIERTO',
    fecha_inicio: null,
    fecha_fin_prog: null,
    fecha_fin_real: null,
    presupuesto_estado: 'Aprobado',
    presupuesto_costo_directo: null,
    presupuesto_gastos_generales: null,
    presupuesto_viaticos: null,
    presupuesto_monto: '1450000.00',
    oc_file: null,
    ...overrides,
  };
}

describe('centro-costo', () => {
  let controller: CentroCostoController;
  const centroAll = vi.fn();
  const centroFirst = vi.fn();
  const empresasAll = vi.fn();
  const principalesAll = vi.fn();
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
          centro_costos_principal: { orderBy: vi.fn(() => ({ all: principalesAll })), all: principalesAll },
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
    centroAll.mockResolvedValue([ccRow({ id_centro_costos_principal: 1 })]);
    empresasAll.mockResolvedValue([
      { id_empresa: 1, razon_social: 'GLD SERVICIOS GENERALES EIRL' },
    ]);
    principalesAll.mockResolvedValue([
      { id: 1, centro_costo_principal: 'afa1e4fc', descripcion: 'TIENDA 3A', estado: 'ABIERTO', id_empresa: 1 },
    ]);
    anexosAll.mockResolvedValue([]);

    const result = await controller.findAll({});
    expect(result.data[0]).toMatchObject({
      Empresa: 'GLD SERVICIOS GENERALES EIRL',
      Cliente: 'A1',
      PresupuestoMonto: '1450000.00',
    });
    expect(result.total).toBe(1);
  });

  it('aplica el filtro de estado', async () => {
    centroAll.mockResolvedValue([
      ccRow(),
      ccRow({ id: 2, estado: 'CERRADO' }),
    ]);
    empresasAll.mockResolvedValue([]);
    principalesAll.mockResolvedValue([]);
    anexosAll.mockResolvedValue([]);

    const result = await controller.findAll({ estado: 'CERRADO' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe(2);
  });

  it('pagina los resultados', async () => {
    centroAll.mockResolvedValue([
      ccRow({ id: 3, estado: 'ABIERTO' }),
      ccRow({ id: 2, estado: 'CERRADO' }),
      ccRow({ id: 1, estado: 'ABIERTO' }),
    ]);
    empresasAll.mockResolvedValue([]);
    principalesAll.mockResolvedValue([]);
    anexosAll.mockResolvedValue([]);

    const result = await controller.findAll({ page: 2, pageSize: 2 });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe(1);
    expect(result.total).toBe(3);
    expect(result.page).toBe(2);
    expect(result.totalPages).toBe(2);
  });

  it('devuelve el conteo de estados', async () => {
    centroAll.mockResolvedValue([
      ccRow(),
      ccRow({ id: 2, estado: 'CERRADO' }),
      ccRow({ id: 3, estado: 'ABIERTO' }),
    ]);
    await expect(controller.getConteoEstados()).resolves.toEqual({
      total: 3,
      abiertos: 2,
      cerrados: 1,
    });
  });

  it('devuelve los catálogos de filtros', async () => {
    centroAll.mockResolvedValue([
      ccRow({ id_centro_costos_principal: 1 }),
      ccRow({ id: 2, periodo: 2025, presupuesto_estado: 'Pendiente', id_centro_costos_principal: 1 }),
    ]);
    empresasAll.mockResolvedValue([{ id_empresa: 1, razon_social: 'GLD EIRL' }]);
    principalesAll.mockResolvedValue([
      { id: 1, centro_costo_principal: 'afa1e4fc', descripcion: 'TIENDA 3A', estado: 'ABIERTO', id_empresa: 1 },
    ]);
    anexosAll.mockResolvedValue([]);

    const result = await controller.getCatalogosFiltros();
    expect(result.empresas).toContain('GLD EIRL');
    expect(result.periodos).toEqual([2026, 2025]);
    expect(result.estados).toEqual(['ABIERTO']);
    expect(result.pptoEstados).toEqual(['Aprobado', 'Pendiente']);
  });

  it('lista centros de costos principales con la empresa', async () => {
    principalesAll.mockResolvedValue([
      { id: 1, centro_costo_principal: 'afa1e4fc', descripcion: 'TIENDA 3A', estado: 'ABIERTO', id_empresa: 1 },
      { id: 2, centro_costo_principal: 'x9f0a2b1', descripcion: 'OFICINA PRINCIPAL', estado: 'ABIERTO', id_empresa: null },
    ]);
    empresasAll.mockResolvedValue([
      { id_empresa: 1, razon_social: 'GLD SERVICIOS GENERALES EIRL' },
    ]);

    const result = await controller.getCentrosCostoPrincipal();
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: 1,
      centro_costo_principal: 'afa1e4fc',
      Empresa: 'GLD SERVICIOS GENERALES EIRL',
    });
    expect(result[1].Empresa).toBeNull();
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

    const result = await controller.getResumenFinanciero(1);
    expect(result).toMatchObject({
      id: 1,
      presupuestoBase: 115,
      presupuestoComercial: 200,
      gastosAcumulados: 80,
      pagosRealizados: 30,
      saldoActual: 120,
    });
  });
});