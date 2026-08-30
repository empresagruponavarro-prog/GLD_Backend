import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { UnidadMedidaController } from './unidad-medida.controller.js';
import { UnidadMedidaHandler } from './unidad-medida.handler.js';

describe('unidad-medida', () => {
  let controller: UnidadMedidaController;
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
          unidad_medida: {
            orderBy: vi.fn(() => ({ all })),
            first,
            create,
            where: vi.fn(() => ({ update, delete: remove })),
          },
        },
      },
    } as unknown as Database;

    const moduleRef = await Test.createTestingModule({
      controllers: [UnidadMedidaController],
      providers: [UnidadMedidaHandler, { provide: DB, useValue: dbMock }],
    }).compile();

    controller = moduleRef.get(UnidadMedidaController);
  });

  it('lista las unidades de medida', async () => {
    const rows = [{ id: 1, codigo: 'CIEN', descripcion: 'CIENTO', simbolo: null }];
    all.mockResolvedValue(rows);
    await expect(controller.list()).resolves.toEqual(rows);
  });

  it('obtiene por id', async () => {
    const row = { id: 1, codigo: 'CIEN', descripcion: 'CIENTO', simbolo: null };
    first.mockResolvedValue(row);
    await expect(controller.getById(1)).resolves.toEqual(row);
    expect(first).toHaveBeenCalledWith({ id: 1 });
  });

  it('responde 404 cuando no existe', async () => {
    first.mockResolvedValue(null);
    await expect(controller.getById(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('crea una unidad de medida', async () => {
    const row = { id: 1, codigo: 'CIEN', descripcion: 'CIENTO', simbolo: '100' };
    create.mockResolvedValue(row);
    await expect(
      controller.create({ codigo: 'CIEN', descripcion: 'CIENTO', simbolo: '100' }),
    ).resolves.toEqual(row);
    expect(create).toHaveBeenCalledWith({
      codigo: 'CIEN',
      descripcion: 'CIENTO',
      simbolo: '100',
    });
  });

  it('responde 409 cuando el código ya existe', async () => {
    create.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: '23505' }));
    await expect(
      controller.create({ codigo: 'CIEN', descripcion: 'CIENTO' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('actualiza solo los campos enviados', async () => {
    const row = { id: 1, codigo: 'CIEN', descripcion: 'CIENTO', simbolo: '100' };
    update.mockResolvedValue(row);
    await expect(controller.update(1, { simbolo: '100' })).resolves.toEqual(row);
    expect(update).toHaveBeenCalledWith({ simbolo: '100' });
  });

  it('responde 404 al actualizar una inexistente', async () => {
    update.mockResolvedValue(null);
    await expect(controller.update(99, { simbolo: '100' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('elimina una unidad de medida', async () => {
    remove.mockResolvedValue({ id: 1 });
    await expect(controller.remove(1)).resolves.toBeUndefined();
  });

  it('responde 404 al eliminar una inexistente', async () => {
    remove.mockResolvedValue(null);
    await expect(controller.remove(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('responde 409 al eliminar con dependencias', async () => {
    remove.mockRejectedValue(Object.assign(new Error('fk violation'), { code: '23503' }));
    await expect(controller.remove(1)).rejects.toBeInstanceOf(ConflictException);
  });
});