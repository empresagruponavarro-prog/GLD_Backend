import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DB, type Database } from '../../../../prisma/prisma.module.js';
import { ProductoHandler } from '../../producto/producto.handler.js';
import { UnidadMedidaProductosController } from './productos.controller.js';
import { UnidadMedidaProductosHandler } from './productos.handler.js';

describe('unidad-medida/productos', () => {
  let controller: UnidadMedidaProductosController;
  const all = vi.fn();
  const aggregate = vi.fn();
  const unidadFirst = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();

    const whereResult = {
      where: vi.fn(() => whereResult),
      orderBy: vi.fn(() => orderByResult),
      aggregate,
      limit: vi.fn(() => ({ offset: vi.fn(() => ({ all })) })),
    };
    const orderByResult = {
      aggregate,
      where: vi.fn(() => whereResult),
      limit: vi.fn(() => ({ offset: vi.fn(() => ({ all })) })),
    };

    const dbMock = {
      orm: {
        public: {
          unidad_medida: { first: unidadFirst },
          producto: {
            orderBy: vi.fn(() => orderByResult),
            where: vi.fn(() => whereResult),
          },
        },
      },
    } as unknown as Database;

    const moduleRef = await Test.createTestingModule({
      controllers: [UnidadMedidaProductosController],
      providers: [
        UnidadMedidaProductosHandler,
        ProductoHandler,
        { provide: DB, useValue: dbMock },
      ],
    }).compile();

    controller = moduleRef.get(UnidadMedidaProductosController);
  });

  it('lista los productos de la unidad de medida', async () => {
    const rows = [{ id: 1, codigo: 'P1', descripcion: 'D', id_categoria: 1, id_unidad_medida: 3, tipo_producto: 'PRODUCTO', stock: '0', comentarios: null, imagen_url: null, estado: true }];
    unidadFirst.mockResolvedValue({ id: 3 });
    all.mockResolvedValue(rows);
    aggregate.mockResolvedValue({ total: 1 });
    await expect(controller.list(3, {})).resolves.toEqual({
      data: rows,
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it('responde 404 si la unidad de medida no existe', async () => {
    unidadFirst.mockResolvedValue(null);
    await expect(controller.list(99, {})).rejects.toBeInstanceOf(NotFoundException);
    expect(all).not.toHaveBeenCalled();
  });
});