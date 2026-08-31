import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { TipoCategoriaController } from './tipo-categoria.controller.js';
import { TipoCategoriaHandler } from './tipo-categoria.handler.js';

describe('tipo-categoria', () => {
  let controller: TipoCategoriaController;
  const all = vi.fn();
  const aggregate = vi.fn();
  const first = vi.fn();
  const create = vi.fn();
  const update = vi.fn();

  const row = { id: 1, codigo: 'CD', nombre: 'COSTO DIRECTO', estado: true };

  beforeEach(async () => {
    vi.clearAllMocks();

    const dbMock = {
      orm: {
        public: {
          tipo_categoria: {
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
        },
      },
    } as unknown as Database;

    const moduleRef = await Test.createTestingModule({
      controllers: [TipoCategoriaController],
      providers: [TipoCategoriaHandler, { provide: DB, useValue: dbMock }],
    }).compile();

    controller = moduleRef.get(TipoCategoriaController);
  });

  it('lista los tipos de categoría paginado', async () => {
    all.mockResolvedValue([row]);
    aggregate.mockResolvedValue({ total: 3 });
    await expect(controller.list({ page: 2, pageSize: 10 })).resolves.toEqual({
      data: [row],
      page: 2,
      pageSize: 10,
      total: 3,
      totalPages: 1,
    });
  });

  it('lista aplicando filtros', async () => {
    all.mockResolvedValue([row]);
    aggregate.mockResolvedValue({ total: 1 });
    await expect(controller.list({ codigo: 'CD', estado: true })).resolves.toEqual({
      data: [row],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it('obtiene por id', async () => {
    first.mockResolvedValue(row);
    await expect(controller.getById(1)).resolves.toEqual(row);
    expect(first).toHaveBeenCalledWith({ id: 1 });
  });

  it('responde 404 cuando no existe', async () => {
    first.mockResolvedValue(null);
    await expect(controller.getById(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('crea un tipo de categoría', async () => {
    create.mockResolvedValue(row);
    await expect(controller.create({ codigo: 'CD', nombre: 'COSTO DIRECTO' })).resolves.toEqual(row);
    expect(create).toHaveBeenCalledWith({ codigo: 'CD', nombre: 'COSTO DIRECTO', estado: undefined });
  });

  it('responde 409 cuando el código ya existe', async () => {
    create.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: '23505' }));
    await expect(controller.create({ codigo: 'CD', nombre: 'X' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('actualiza un tipo de categoría', async () => {
    update.mockResolvedValue(row);
    await expect(controller.update(1, { nombre: 'NUEVO' })).resolves.toEqual(row);
  });

  it('responde 404 al actualizar uno inexistente', async () => {
    update.mockResolvedValue(null);
    await expect(controller.update(99, { nombre: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('desactiva el tipo de categoría al eliminar', async () => {
    update.mockResolvedValue(row);
    await expect(controller.remove(1)).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledWith({ estado: false });
  });

  it('responde 404 al eliminar uno inexistente', async () => {
    update.mockResolvedValue(null);
    await expect(controller.remove(99)).rejects.toBeInstanceOf(NotFoundException);
  });
});