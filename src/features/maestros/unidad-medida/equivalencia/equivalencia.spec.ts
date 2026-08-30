import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DB, type Database } from '../../../../prisma/prisma.module.js';
import { EquivalenciaController } from './equivalencia.controller.js';
import { EquivalenciaHandler } from './equivalencia.handler.js';

describe('equivalencia', () => {
  let controller: EquivalenciaController;
  const all = vi.fn();
  const first = vi.fn();
  const create = vi.fn();
  const update = vi.fn();
  const remove = vi.fn();
  const unidadFirst = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();

    const dbMock = {
      orm: {
        public: {
          unidad_medida: { first: unidadFirst },
          unidad_medida_equivalencia: {
            orderBy: vi.fn(() => ({ all })),
            first,
            create,
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({ all })),
              update,
              delete: remove,
            })),
          },
        },
      },
    } as unknown as Database;

    const moduleRef = await Test.createTestingModule({
      controllers: [EquivalenciaController],
      providers: [EquivalenciaHandler, { provide: DB, useValue: dbMock }],
    }).compile();

    controller = moduleRef.get(EquivalenciaController);
  });

  it('lista las equivalencias de la unidad', async () => {
    const rows = [{ id: 1, id_uni_med_origen: 1, id_uni_med_destino: 2, factor_conversion: '100' }];
    unidadFirst.mockResolvedValue({ id: 1 });
    all.mockResolvedValue(rows);
    await expect(controller.list(1)).resolves.toEqual(rows);
  });

  it('responde 404 si la unidad origen no existe', async () => {
    unidadFirst.mockResolvedValue(null);
    await expect(controller.list(99)).rejects.toBeInstanceOf(NotFoundException);
    expect(all).not.toHaveBeenCalled();
  });

  it('obtiene una equivalencia del origen indicado', async () => {
    const row = { id: 1, id_uni_med_origen: 1, id_uni_med_destino: 2, factor_conversion: '100' };
    first.mockResolvedValue(row);
    await expect(controller.getById(1, 1)).resolves.toEqual(row);
    expect(first).toHaveBeenCalledWith({ id: 1, id_uni_med_origen: 1 });
  });

  it('responde 404 si la equivalencia no pertenece al origen', async () => {
    first.mockResolvedValue(null);
    await expect(controller.getById(5, 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('crea una equivalencia', async () => {
    const row = { id: 1, id_uni_med_origen: 1, id_uni_med_destino: 2, factor_conversion: '100' };
    unidadFirst.mockResolvedValue({ id: 1 }).mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce({ id: 2 });
    create.mockResolvedValue(row);
    await expect(
      controller.create(1, { id_uni_med_destino: 2, factor_conversion: '100' }),
    ).resolves.toEqual(row);
    expect(create).toHaveBeenCalledWith({
      id_uni_med_origen: 1,
      id_uni_med_destino: 2,
      factor_conversion: '100',
    });
  });

  it('responde 400 si el destino es la misma unidad', async () => {
    await expect(
      controller.create(1, { id_uni_med_destino: 1, factor_conversion: '1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('responde 400 si la unidad destino no existe', async () => {
    unidadFirst.mockResolvedValue({ id: 1 });
    unidadFirst.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(null);
    await expect(
      controller.create(1, { id_uni_med_destino: 99, factor_conversion: '1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('responde 409 si la equivalencia ya existe', async () => {
    unidadFirst.mockResolvedValue({ id: 1 }).mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce({ id: 2 });
    create.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: '23505' }));
    await expect(
      controller.create(1, { id_uni_med_destino: 2, factor_conversion: '100' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('actualiza una equivalencia', async () => {
    const row = { id: 1, id_uni_med_origen: 1, id_uni_med_destino: 2, factor_conversion: '50' };
    first.mockResolvedValue(row);
    update.mockResolvedValue(row);
    await expect(controller.update(1, 1, { factor_conversion: '50' })).resolves.toEqual(row);
    expect(update).toHaveBeenCalledWith({ factor_conversion: '50' });
  });

  it('responde 404 al actualizar una equivalencia de otro origen', async () => {
    first.mockResolvedValue(null);
    await expect(controller.update(5, 1, { factor_conversion: '50' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('elimina una equivalencia', async () => {
    remove.mockResolvedValue({ id: 1 });
    await expect(controller.remove(1, 1)).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalled();
  });

  it('responde 404 al eliminar una equivalencia de otro origen', async () => {
    remove.mockResolvedValue(null);
    await expect(controller.remove(5, 1)).rejects.toBeInstanceOf(NotFoundException);
  });
});