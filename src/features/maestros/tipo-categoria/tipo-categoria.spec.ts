import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { TipoCategoriaController } from './tipo-categoria.controller.js';
import { TipoCategoriaHandler } from './tipo-categoria.handler.js';

describe('tipo-categoria', () => {
  let controller: TipoCategoriaController;
  const all = vi.fn();
  const first = vi.fn();
  const create = vi.fn();
  const update = vi.fn();
  const remove = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();

    const dbMock = {
      orm: {
        public: {
          tipo_categoria: {
            orderBy: vi.fn(() => ({ all })),
            first,
            create,
            where: vi.fn(() => ({ update, delete: remove })),
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

  it('lista los tipos de categoría', async () => {
    const rows = [{ id: 1, codigo: 'CD', nombre: 'COSTO DIRECTO' }];
    all.mockResolvedValue(rows);
    await expect(controller.list()).resolves.toEqual(rows);
  });

  it('obtiene por id', async () => {
    const row = { id: 1, codigo: 'CD', nombre: 'COSTO DIRECTO' };
    first.mockResolvedValue(row);
    await expect(controller.getById(1)).resolves.toEqual(row);
    expect(first).toHaveBeenCalledWith({ id: 1 });
  });

  it('responde 404 cuando no existe', async () => {
    first.mockResolvedValue(null);
    await expect(controller.getById(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('crea un tipo de categoría', async () => {
    const row = { id: 1, codigo: 'CD', nombre: 'COSTO DIRECTO' };
    create.mockResolvedValue(row);
    await expect(controller.create({ codigo: 'CD', nombre: 'COSTO DIRECTO' })).resolves.toEqual(row);
    expect(create).toHaveBeenCalledWith({ codigo: 'CD', nombre: 'COSTO DIRECTO' });
  });

  it('responde 409 cuando el código ya existe', async () => {
    create.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: '23505' }));
    await expect(controller.create({ codigo: 'CD', nombre: 'X' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('actualiza un tipo de categoría', async () => {
    const row = { id: 1, codigo: 'CD', nombre: 'NUEVO' };
    update.mockResolvedValue(row);
    await expect(controller.update(1, { nombre: 'NUEVO' })).resolves.toEqual(row);
  });

  it('responde 404 al actualizar uno inexistente', async () => {
    update.mockResolvedValue(null);
    await expect(controller.update(99, { nombre: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('elimina un tipo de categoría', async () => {
    remove.mockResolvedValue({ id: 1 });
    await expect(controller.remove(1)).resolves.toBeUndefined();
  });

  it('responde 404 al eliminar uno inexistente', async () => {
    remove.mockResolvedValue(null);
    await expect(controller.remove(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('responde 409 al eliminar con categorías asociadas', async () => {
    remove.mockRejectedValue(Object.assign(new Error('fk violation'), { code: '23503' }));
    await expect(controller.remove(1)).rejects.toBeInstanceOf(ConflictException);
  });
});