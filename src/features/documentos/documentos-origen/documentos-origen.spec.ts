import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { DocumentosOrigenController } from './documentos-origen.controller.js';
import { DocumentosOrigenHandler } from './documentos-origen.handler.js';

describe('documentos-origen', () => {
  let controller: DocumentosOrigenController;
  const all = vi.fn();
  const aggregate = vi.fn();
  const create = vi.fn();
  const update = vi.fn();
  const ordenCompraFirst = vi.fn();
  const faseAll = vi.fn();
  const faseFirst = vi.fn();
  const detalleCreate = vi.fn();
  const detalleDelete = vi.fn();
  const detalleAll = vi.fn();
  const productoAll = vi.fn();
  const centroAll = vi.fn();
  const centroFirst = vi.fn();
  const categoriaFirst = vi.fn();
  const anexoFirst = vi.fn();

  const row = {
    id: 1,
    id_oc: 'OC-001',
    tipo_costo: 'DIRECTO',
    tipo_oc: 'PRODUCTO',
    numero_oc: '0001-2026',
    id_centro_costo: 884,
    id_categoria: 3,
    id_fase: 7,
    periodo: '2026',
    mes: 'ENERO',
    id_anexo: 10,
    fecha_emision: '2026-01-15T00:00:00.000Z',
    forma_pago: 'CREDITO',
    moneda_id: 'PEN',
    moneda_simbolo: 'S/',
    monto: '1000.00',
    igv: '180.00',
    renta_4ta: '0.00',
    dscto_compras: '0.00',
    dscto_intervencion: '0.00',
    dscto_otros: '0.00',
    total: '1180.00',
    comentarios: 'ok',
    oc_pdf: 'oc-001.pdf',
    usuario: 'admin@luadag.com',
    fecha_creacion: '2026-01-15T00:00:00.000Z',
    hora_creacion: '10:30',
    cotizacion: 'COT-001',
  };

  const listResponse = {
    ...row,
    nombre_centro_costo: 'CENTRO X',
    nombre_categoria: null,
    nombre_fase: 'OBRA GRUESA',
    nombre_anexo: null,
    detalles: [],
  };
  const itemResponse = {
    ...row,
    nombre_centro_costo: 'CENTRO X',
    nombre_categoria: 'MATERIALES',
    nombre_fase: 'OBRA GRUESA',
    nombre_anexo: 'ACME S.A.C.',
    detalles: [],
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    faseAll.mockResolvedValue([{ id: 7, FaseProyecto: 'OBRA GRUESA' }]);
    faseFirst.mockResolvedValue({ id: 7, FaseProyecto: 'OBRA GRUESA' });
    ordenCompraFirst.mockResolvedValue(row);
    detalleAll.mockResolvedValue([]);
    detalleDelete.mockResolvedValue(undefined);
    productoAll.mockResolvedValue([]);
    centroAll.mockResolvedValue([{ id: 884, centro_costo: 'CENTRO X' }]);
    centroFirst.mockResolvedValue({ id: 884, centro_costo: 'CENTRO X' });
    categoriaFirst.mockResolvedValue({ id: 3, codigo: 'MAT', descripcion: 'MATERIALES' });
    anexoFirst.mockResolvedValue({ id: 10, Anexo: 'ACME S.A.C.', NombreComercial: 'ACME' });

    const dbMock = {
      orm: {
        public: {
          OrdenCompra: {
            orderBy: vi.fn(() => ({
              aggregate,
              where: vi.fn(() => ({
                aggregate,
                limit: vi.fn(() => ({ offset: vi.fn(() => ({ all })) })),
              })),
              limit: vi.fn(() => ({ offset: vi.fn(() => ({ all })) })),
            })),
            create,
            first: ordenCompraFirst,
            where: vi.fn(() => ({ update, all })),
          },
          OrdenCompraDetalle: {
            create: detalleCreate,
            where: vi.fn(() => ({
              delete: detalleDelete,
              orderBy: vi.fn(() => ({ all: detalleAll })),
            })),
          },
          producto: {
            where: vi.fn(() => ({ all: productoAll })),
          },
          CentroCostos: {
            where: vi.fn(() => ({ all: centroAll })),
            first: centroFirst,
          },
          categoria: {
            first: categoriaFirst,
          },
          Anexos: {
            first: anexoFirst,
          },
          ppto_Fases: {
            where: vi.fn(() => ({ all: faseAll })),
            first: faseFirst,
          },
        },
      },
    } as unknown as Database;

    const moduleRef = await Test.createTestingModule({
      controllers: [DocumentosOrigenController],
      providers: [DocumentosOrigenHandler, { provide: DB, useValue: dbMock }],
    }).compile();

    controller = moduleRef.get(DocumentosOrigenController);
  });

  it('lista los documentos de origen paginado', async () => {
    all.mockResolvedValue([row]);
    aggregate.mockResolvedValue({ total: 5 });
    await expect(controller.list({ page: 1, pageSize: 10 })).resolves.toEqual({
      data: [listResponse],
      page: 1,
      pageSize: 10,
      total: 5,
      totalPages: 1,
    });
  });

  it('aplica filtros de busqueda y relaciones', async () => {
    all.mockResolvedValue([row]);
    aggregate.mockResolvedValue({ total: 1 });
    await expect(
      controller.list({
        search: 'OC-001',
        tipo_oc: 'PRODUCTO',
        periodo: '2026',
        mes: 'ENERO',
        id_centro_costo: 884,
        id_categoria: 3,
        id_fase: 7,
        id_anexo: 10,
      }),
    ).resolves.toEqual({
      data: [listResponse],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it('crea un documento de origen', async () => {
    create.mockResolvedValue(row);
    await expect(
      controller.create({ id_oc: 'OC-001', id_centro_costo: 884 }),
    ).resolves.toEqual(itemResponse);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        id_oc: 'OC-001',
        id_centro_costo: 884,
        monto: '0.00',
        total: '0.00',
      }),
    );
  });

  it('crea documento con detalles y calcula monto y total', async () => {
    create.mockResolvedValue(row);
    productoAll.mockResolvedValue([
      { id: 1, codigo: 'P1', descripcion: 'PRODUCTO 1', tipo_producto: 'PRODUCTO' },
      { id: 2, codigo: 'P2', descripcion: 'PRODUCTO 2', tipo_producto: 'PRODUCTO' },
    ]);
    detalleCreate
      .mockResolvedValueOnce({
        id: 11,
        ProductoCodigo: 'P1',
        TipoProducto: 'PRODUCTO',
        Cantidad: '2.00',
        Precio: '100.00',
        monto: '200.00',
      })
      .mockResolvedValueOnce({
        id: 12,
        ProductoCodigo: 'P2',
        TipoProducto: 'PRODUCTO',
        Cantidad: '3.00',
        Precio: '50.50',
        monto: '151.50',
      });

    const result = await controller.create({
      id_oc: 'OC-002',
      igv: 18,
      dscto_compras: 10,
      detalles: [
        { id_producto: 1, cantidad: 2, precio: 100 },
        { id_producto: 2, cantidad: 3, precio: 50.5 },
      ],
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        monto: '351.50',
        igv: '18.00',
        dscto_compras: '10.00',
        total: '359.50',
      }),
    );
    expect(result.detalles).toHaveLength(2);
    expect(result.detalles[0].producto_descripcion).toBe('PRODUCTO 1');
  });

  it('obtiene un documento de origen por id con nombres resueltos', async () => {
    await expect(controller.getById(1)).resolves.toEqual(itemResponse);
  });

  it('lista el detalle de documentos por centro de costo y fase', async () => {
    all.mockResolvedValue([row]);
    detalleAll.mockResolvedValue([
      {
        id: 682,
        ProductoCodigo: 'c3b626f6',
        TipoProducto: 'PRODUCTO',
        Cantidad: '4.00',
        Precio: '44.00',
        monto: '176.00',
        id_orden_compra: 1,
      },
    ]);
    productoAll.mockResolvedValue([
      { id: 8395, codigo: 'c3b626f6', descripcion: 'CEMENTO', tipo_producto: 'PRODUCTO' },
    ]);

    const result = await controller.listDetallePorFase({ id_centro_costo: 884, id_fase: 7 });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id_documento: 1,
      id_detalle: 682,
      id_producto: 8395,
      producto_descripcion: 'CEMENTO',
      nombre_centro_costo: 'CENTRO X',
      nombre_fase: 'OBRA GRUESA',
      cantidad: '4.00',
      precio: '44.00',
      monto: '176.00',
    });
  });

  it('actualiza un documento de origen', async () => {
    update.mockResolvedValue(row);
    await expect(controller.update(1, { numero_oc: '0001-2026' })).resolves.toEqual(itemResponse);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ numero_oc: '0001-2026' }));
  });

  it('responde 404 al actualizar uno inexistente', async () => {
    ordenCompraFirst.mockResolvedValueOnce(null);
    await expect(controller.update(99, { numero_oc: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('responde 404 al obtener uno inexistente', async () => {
    ordenCompraFirst.mockResolvedValueOnce(null);
    await expect(controller.getById(99)).rejects.toBeInstanceOf(NotFoundException);
  });
});
