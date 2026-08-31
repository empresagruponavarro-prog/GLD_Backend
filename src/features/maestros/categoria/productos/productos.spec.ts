import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DB, type Database } from '../../../../prisma/prisma.module.js';
import { ProductoHandler } from '../../producto/producto.handler.js';
import { CategoriaProductosController } from './productos.controller.js';
import { CategoriaProductosHandler } from './productos.handler.js';

describe('categoria/productos', () => {
  let controller: CategoriaProductosController;
  const all = vi.fn();
  const aggregate = vi.fn();
  const categoriaFirst = vi.fn();

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
          categoria: { first: categoriaFirst },
          producto: {
            orderBy: vi.fn(() => orderByResult),
            where: vi.fn(() => whereResult),
          },
        },
      },
    } as unknown as Database;

    const moduleRef = await Test.createTestingModule({
      controllers: [CategoriaProductosController],
      providers: [
        CategoriaProductosHandler,
        ProductoHandler,
        { provide: DB, useValue: dbMock },
      ],
    }).compile();

    controller = moduleRef.get(CategoriaProductosController);
  });

  it('lista los productos de la categoría', async () => {
    const rows = [{ id: 1, codigo: 'P1', descripcion: 'D', id_categoria: 3, id_unidad_medida: 1, tipo_producto: 'PRODUCTO', stock: '0', comentarios: null, imagen_url: null, estado: true }];
    categoriaFirst.mockResolvedValue({ id: 3 });
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

  it('responde 404 si la categoría no existe', async () => {
    categoriaFirst.mockResolvedValue(null);
    await expect(controller.list(99, {})).rejects.toBeInstanceOf(NotFoundException);
    expect(all).not.toHaveBeenCalled();
  });
});