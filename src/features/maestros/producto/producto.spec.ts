import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { ProductoController } from './producto.controller.js';
import { ProductoHandler } from './producto.handler.js';

const ROW = {
  id: 1,
  codigo: 'PROD-001',
  descripcion: 'CEMENTO',
  id_categoria: 1,
  id_unidad_medida: 1,
  tipo_producto: 'PRODUCTO',
  stock: '0',
  comentarios: null,
  imagen_url: null,
  estado: true,
} as const;

describe('producto', () => {
  let controller: ProductoController;
  const all = vi.fn();
  const aggregate = vi.fn();
  const first = vi.fn();
  const create = vi.fn();
  const update = vi.fn();
  const categoriaFirst = vi.fn();
  const unidadFirst = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();

    const dbMock = {
      orm: {
        public: {
          producto: {
            orderBy: vi.fn(() => ({
              aggregate,
              where: vi.fn(() => ({
                aggregate,
                limit: vi.fn(() => ({ offset: vi.fn(() => ({ all })) })),
              })),
              limit: vi.fn(() => ({ offset: vi.fn(() => ({ all })) })),
            })),
            first,
            create,
            where: vi.fn(() => ({ update })),
          },
          categoria: { first: categoriaFirst },
          unidad_medida: { first: unidadFirst },
        },
      },
    } as unknown as Database;

    const moduleRef = await Test.createTestingModule({
      controllers: [ProductoController],
      providers: [ProductoHandler, { provide: DB, useValue: dbMock }],
    }).compile();

    controller = moduleRef.get(ProductoController);
  });

  it('lista los productos paginado', async () => {
    all.mockResolvedValue([ROW]);
    aggregate.mockResolvedValue({ total: 57 });
    await expect(controller.list({ page: 2, pageSize: 10 })).resolves.toEqual({
      data: [ROW],
      page: 2,
      pageSize: 10,
      total: 57,
      totalPages: 6,
    });
  });

  it('lista aplicando filtros', async () => {
    all.mockResolvedValue([ROW]);
    aggregate.mockResolvedValue({ total: 1 });
    await expect(
      controller.list({ descripcion: 'CEM', tipo_producto: 'PRODUCTO', estado: true }),
    ).resolves.toEqual({
      data: [ROW],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it('obtiene por id', async () => {
    first.mockResolvedValue(ROW);
    await expect(controller.getById(1)).resolves.toEqual(ROW);
    expect(first).toHaveBeenCalledWith({ id: 1 });
  });

  it('responde 404 cuando no existe', async () => {
    first.mockResolvedValue(null);
    await expect(controller.getById(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('crea un producto', async () => {
    categoriaFirst.mockResolvedValue({ id: 1 });
    unidadFirst.mockResolvedValue({ id: 1 });
    create.mockResolvedValue(ROW);
    await expect(
      controller.create({ codigo: 'PROD-001', descripcion: 'CEMENTO', id_categoria: 1, id_unidad_medida: 1 }),
    ).resolves.toEqual(ROW);
    expect(create).toHaveBeenCalledWith({
      codigo: 'PROD-001',
      descripcion: 'CEMENTO',
      id_categoria: 1,
      id_unidad_medida: 1,
      tipo_producto: undefined,
      stock: undefined,
      comentarios: undefined,
      imagen_url: undefined,
      estado: undefined,
    });
  });

  it('responde 400 si la categoría no existe', async () => {
    categoriaFirst.mockResolvedValue(null);
    await expect(
      controller.create({ codigo: 'PROD-001', descripcion: 'X', id_categoria: 99, id_unidad_medida: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('responde 400 si la unidad de medida no existe', async () => {
    categoriaFirst.mockResolvedValue({ id: 1 });
    unidadFirst.mockResolvedValue(null);
    await expect(
      controller.create({ codigo: 'PROD-001', descripcion: 'X', id_categoria: 1, id_unidad_medida: 99 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('responde 409 cuando el código ya existe', async () => {
    categoriaFirst.mockResolvedValue({ id: 1 });
    unidadFirst.mockResolvedValue({ id: 1 });
    create.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: '23505' }));
    await expect(
      controller.create({ codigo: 'PROD-001', descripcion: 'X', id_categoria: 1, id_unidad_medida: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('actualiza solo los campos enviados', async () => {
    const updated = { ...ROW, stock: '25.5' };
    update.mockResolvedValue(updated);
    await expect(controller.update(1, { stock: '25.5' })).resolves.toEqual(updated);
    expect(update).toHaveBeenCalledWith({ stock: '25.5' });
  });

  it('responde 404 al actualizar un inexistente', async () => {
    update.mockResolvedValue(null);
    await expect(controller.update(99, { stock: '1' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('responde 400 al actualizar con una categoría inexistente', async () => {
    categoriaFirst.mockResolvedValue(null);
    await expect(controller.update(1, { id_categoria: 99 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('desactiva el producto al eliminar', async () => {
    update.mockResolvedValue(ROW);
    await expect(controller.remove(1)).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledWith({ estado: false });
  });

  it('responde 404 al eliminar un inexistente', async () => {
    update.mockResolvedValue(null);
    await expect(controller.remove(99)).rejects.toBeInstanceOf(NotFoundException);
  });
});