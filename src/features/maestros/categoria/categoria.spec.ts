import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { CategoriaController } from './categoria.controller.js';
import { CategoriaHandler } from './categoria.handler.js';

describe('categoria', () => {
  let controller: CategoriaController;
  const all = vi.fn();
  const first = vi.fn();
  const create = vi.fn();
  const update = vi.fn();
  const tipoFirst = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();

    const dbMock = {
      orm: {
        public: {
          categoria: {
            orderBy: vi.fn(() => ({ all })),
            first,
            create,
            where: vi.fn(() => ({ update })),
          },
          tipo_categoria: { first: tipoFirst },
        },
      },
    } as unknown as Database;

    const moduleRef = await Test.createTestingModule({
      controllers: [CategoriaController],
      providers: [CategoriaHandler, { provide: DB, useValue: dbMock }],
    }).compile();

    controller = moduleRef.get(CategoriaController);
  });

  it('lista las categorías', async () => {
    const rows = [{ id: 1, codigo: 'MAT', id_tipo_categoria: 1, descripcion: null, estado: true }];
    all.mockResolvedValue(rows);
    await expect(controller.list()).resolves.toEqual(rows);
  });

  it('obtiene por id', async () => {
    const row = { id: 1, codigo: 'MAT', id_tipo_categoria: 1, descripcion: null, estado: true };
    first.mockResolvedValue(row);
    await expect(controller.getById(1)).resolves.toEqual(row);
    expect(first).toHaveBeenCalledWith({ id: 1 });
  });

  it('responde 404 cuando no existe', async () => {
    first.mockResolvedValue(null);
    await expect(controller.getById(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('crea una categoría con estado por defecto', async () => {
    const row = { id: 1, codigo: 'MAT', id_tipo_categoria: 1, descripcion: null, estado: true };
    tipoFirst.mockResolvedValue({ id: 1 });
    create.mockResolvedValue(row);
    await expect(
      controller.create({ codigo: 'MAT', id_tipo_categoria: 1 }),
    ).resolves.toEqual(row);
    expect(create).toHaveBeenCalledWith({
      codigo: 'MAT',
      id_tipo_categoria: 1,
      descripcion: undefined,
      estado: true,
    });
  });

  it('responde 400 si el tipo de categoría no existe', async () => {
    tipoFirst.mockResolvedValue(null);
    await expect(
      controller.create({ codigo: 'MAT', id_tipo_categoria: 99 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('responde 409 cuando el código ya existe', async () => {
    tipoFirst.mockResolvedValue({ id: 1 });
    create.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: '23505' }));
    await expect(
      controller.create({ codigo: 'MAT', id_tipo_categoria: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('actualiza solo los campos enviados', async () => {
    const row = { id: 1, codigo: 'MAT', id_tipo_categoria: 1, descripcion: 'Mat', estado: true };
    update.mockResolvedValue(row);
    await expect(controller.update(1, { descripcion: 'Mat' })).resolves.toEqual(row);
    expect(update).toHaveBeenCalledWith({ descripcion: 'Mat' });
  });

  it('responde 404 al actualizar una inexistente', async () => {
    update.mockResolvedValue(null);
    await expect(controller.update(99, { descripcion: 'X' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('responde 400 al actualizar con un tipo de categoría inexistente', async () => {
    tipoFirst.mockResolvedValue(null);
    await expect(controller.update(1, { id_tipo_categoria: 99 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('desactiva la categoría al eliminar', async () => {
    update.mockResolvedValue({ id: 1, estado: false });
    await expect(controller.remove(1)).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledWith({ estado: false });
  });

  it('responde 404 al eliminar una inexistente', async () => {
    update.mockResolvedValue(null);
    await expect(controller.remove(99)).rejects.toBeInstanceOf(NotFoundException);
  });
});