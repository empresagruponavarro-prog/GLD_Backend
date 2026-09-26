import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { UnidadMedidaController } from './unidad-medida.controller.js';
import { UnidadMedidaHandler } from './unidad-medida.handler.js';

describe('unidad-medida', () => {
  let controller: UnidadMedidaController;
  const all = vi.fn();
  const aggregate = vi.fn();
  const first = vi.fn();
  const create = vi.fn();
  const update = vi.fn();

  const row = { id: 1, codigo: 'CIEN', descripcion: 'CIENTO', simbolo: '100', estado: true };

  beforeEach(async () => {
    vi.clearAllMocks();

    const dbMock = {
      orm: {
        public: {
          unidad_medida: {
            orderBy: vi.fn(() => ({
              all,
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
      controllers: [UnidadMedidaController],
      providers: [UnidadMedidaHandler, { provide: DB, useValue: dbMock }],
    }).compile();

    controller = moduleRef.get(UnidadMedidaController);
  });

  it('lista las unidades de medida paginado', async () => {
    all.mockResolvedValue([row]);
    aggregate.mockResolvedValue({ total: 1 });
    await expect(controller.list({ page: 1, pageSize: 20 })).resolves.toEqual({
      data: [row],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it('lista aplicando filtros', async () => {
    all.mockResolvedValue([row]);
    aggregate.mockResolvedValue({ total: 1 });
    await expect(controller.list({ descripcion: 'CIENTO', estado: true })).resolves.toEqual({
      data: [row],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it('lista las unidades de medida para selector', async () => {
    all.mockResolvedValue([row]);
    await expect(controller.select()).resolves.toEqual([{ id: 1, nombre: 'CIENTO (100)' }]);
  });

  it('lista el selector sin símbolo', async () => {
    all.mockResolvedValue([{ ...row, simbolo: null }]);
    await expect(controller.select()).resolves.toEqual([{ id: 1, nombre: 'CIENTO' }]);
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

  it('crea una unidad de medida', async () => {
    create.mockResolvedValue(row);
    await expect(
      controller.create({ codigo: 'CIEN', descripcion: 'CIENTO', simbolo: '100' }),
    ).resolves.toEqual(row);
    expect(create).toHaveBeenCalledWith({
      codigo: 'CIEN',
      descripcion: 'CIENTO',
      simbolo: '100',
      estado: undefined,
    });
  });

  it('responde 409 cuando el código ya existe', async () => {
    create.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: '23505' }));
    await expect(
      controller.create({ codigo: 'CIEN', descripcion: 'CIENTO' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('actualiza solo los campos enviados', async () => {
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

  it('desactiva la unidad de medida al eliminar', async () => {
    update.mockResolvedValue(row);
    await expect(controller.remove(1)).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledWith({ estado: false });
  });

  it('responde 404 al eliminar una inexistente', async () => {
    update.mockResolvedValue(null);
    await expect(controller.remove(99)).rejects.toBeInstanceOf(NotFoundException);
  });
});