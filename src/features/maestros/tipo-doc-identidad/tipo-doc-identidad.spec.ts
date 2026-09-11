import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { TipoAnexo } from './tipo-doc-identidad.dto.js';
import { TipoDocIdentidadController } from './tipo-doc-identidad.controller.js';
import { TipoDocIdentidadHandler } from './tipo-doc-identidad.handler.js';

describe('tipo-doc-identidad', () => {
  let controller: TipoDocIdentidadController;
  const all = vi.fn();
  const aggregate = vi.fn();
  const first = vi.fn();
  const create = vi.fn();
  const update = vi.fn();
  const deleteRow = vi.fn();

  const row = {
    id: 1,
    TipoAnexo: TipoAnexo.Proveedor,
    Anexo_Documento_IDE: 'DNI',
  };

  const response = {
    id: 1,
    tipoAnexo: TipoAnexo.Proveedor,
    descripcion: 'DNI',
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const dbMock = {
      orm: {
        public: {
          Anexo_TipoDocIDE: {
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
            where: vi.fn(() => ({ update, delete: deleteRow })),
          },
        },
      },
    } as unknown as Database;

    const moduleRef = await Test.createTestingModule({
      controllers: [TipoDocIdentidadController],
      providers: [TipoDocIdentidadHandler, { provide: DB, useValue: dbMock }],
    }).compile();

    controller = moduleRef.get(TipoDocIdentidadController);
  });

  it('lista los tipos de documento de identidad paginado', async () => {
    all.mockResolvedValue([row]);
    aggregate.mockResolvedValue({ total: 3 });
    await expect(controller.list({ page: 2, pageSize: 10 })).resolves.toEqual({
      data: [response],
      page: 2,
      pageSize: 10,
      total: 3,
      totalPages: 1,
    });
  });

  it('lista aplicando filtros', async () => {
    all.mockResolvedValue([row]);
    aggregate.mockResolvedValue({ total: 1 });
    await expect(controller.list({ tipoAnexo: TipoAnexo.Proveedor })).resolves.toEqual({
      data: [response],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it('obtiene por id', async () => {
    first.mockResolvedValue(row);
    await expect(controller.getById(1)).resolves.toEqual(response);
    expect(first).toHaveBeenCalledWith({ id: 1 });
  });

  it('responde 404 cuando no existe', async () => {
    first.mockResolvedValue(null);
    await expect(controller.getById(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('crea un tipo de documento de identidad', async () => {
    create.mockResolvedValue(row);
    await expect(
      controller.create({ tipoAnexo: TipoAnexo.Proveedor, descripcion: 'DNI' }),
    ).resolves.toEqual(response);
    expect(create).toHaveBeenCalledWith({
      TipoAnexo: TipoAnexo.Proveedor,
      Anexo_Documento_IDE: 'DNI',
    });
  });

  it('actualiza un tipo de documento de identidad', async () => {
    update.mockResolvedValue(row);
    await expect(controller.update(1, { descripcion: 'RUC' })).resolves.toEqual(response);
  });

  it('responde 404 al actualizar uno inexistente', async () => {
    update.mockResolvedValue(null);
    await expect(controller.update(99, { descripcion: 'X' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('elimina un tipo de documento de identidad', async () => {
    deleteRow.mockResolvedValue(row);
    await expect(controller.remove(1)).resolves.toBeUndefined();
    expect(deleteRow).toHaveBeenCalledWith();
  });

  it('responde 404 al eliminar uno inexistente', async () => {
    deleteRow.mockResolvedValue(null);
    await expect(controller.remove(99)).rejects.toBeInstanceOf(NotFoundException);
  });
});