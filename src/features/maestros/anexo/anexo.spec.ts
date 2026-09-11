import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { AnexoController } from './anexo.controller.js';
import { AnexoHandler } from './anexo.handler.js';
import { TipoAnexo } from './anexo.dto.js';

describe('anexo', () => {
  let controller: AnexoController;
  const all = vi.fn();
  const aggregate = vi.fn();
  const first = vi.fn();
  const create = vi.fn();
  const update = vi.fn();
  const deleteRow = vi.fn();

  const row = {
    id: 1,
    tipoAnexo: TipoAnexo.Proveedor,
    AnexoEspecialidadId: 2,
    AnexoTipoDocIdeId: 3,
    NumeroDocIde: '12345678',
    Anexo: 'ACME S.A.C.',
    NombreComercial: 'ACME',
    Direccion: 'Av. Principal 123',
    Contacto: 'Juan Pérez',
    Telefono: '987654321',
    Correo: 'correo@acme.com',
    estado: true,
  };

  const response = { ...row };

  beforeEach(async () => {
    vi.clearAllMocks();

    const dbMock = {
      orm: {
        public: {
          Anexos: {
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
      controllers: [AnexoController],
      providers: [AnexoHandler, { provide: DB, useValue: dbMock }],
    }).compile();

    controller = moduleRef.get(AnexoController);
  });

  it('lista los anexos paginado', async () => {
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
    await expect(
      controller.list({ tipoAnexo: TipoAnexo.Proveedor, AnexoEspecialidadId: 2, estado: true }),
    ).resolves.toEqual({
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

  it('crea un anexo', async () => {
    create.mockResolvedValue(row);
    await expect(
      controller.create({
        tipoAnexo: TipoAnexo.Proveedor,
        AnexoEspecialidadId: 2,
        Anexo: 'ACME S.A.C.',
      }),
    ).resolves.toEqual(response);
    expect(create).toHaveBeenCalledWith({
      tipoAnexo: TipoAnexo.Proveedor,
      AnexoEspecialidadId: 2,
      AnexoTipoDocIdeId: undefined,
      NumeroDocIde: undefined,
      Anexo: 'ACME S.A.C.',
      NombreComercial: undefined,
      Direccion: undefined,
      Contacto: undefined,
      Telefono: undefined,
      Correo: undefined,
      estado: undefined,
    });
  });

  it('actualiza un anexo', async () => {
    update.mockResolvedValue(row);
    await expect(controller.update(1, { Anexo: 'NUEVO' })).resolves.toEqual(response);
  });

  it('responde 404 al actualizar uno inexistente', async () => {
    update.mockResolvedValue(null);
    await expect(controller.update(99, { Anexo: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('elimina el anexo', async () => {
    deleteRow.mockResolvedValue(row);
    await expect(controller.remove(1)).resolves.toBeUndefined();
    expect(deleteRow).toHaveBeenCalledWith();
  });

  it('responde 404 al eliminar uno inexistente', async () => {
    deleteRow.mockResolvedValue(null);
    await expect(controller.remove(99)).rejects.toBeInstanceOf(NotFoundException);
  });
});
