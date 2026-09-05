import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { EmpresaController } from './empresa.controller.js';
import { EmpresaHandler } from './empresa.handler.js';

function makeRow(CodEmpresa = 'E1') {
  return {
    CodEmpresa,
    RUC: '20123456789',
    RazonSocial: 'GLD SERVICIOS GENERALES EIRL',
    DomicilioFiscal: 'Av. Lima 100',
    DireccionEntrega: 'Av. Lima 100',
    CorreoCompras: 'compras@gld.com',
  };
}

describe('empresa', () => {
  let controller: EmpresaController;
  const create = vi.fn();
  const first = vi.fn();
  const all = vi.fn();
  const update = vi.fn();
  const remove = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();

    const dbMock = {
      orm: {
        public: {
          Empresas: {
            create,
            first,
            orderBy: vi.fn(() => ({
              where: vi.fn(() => ({ all })),
              all,
            })),
            where: vi.fn(() => ({ update, delete: remove })),
          },
        },
      },
    } as unknown as Database;

    const moduleRef = await Test.createTestingModule({
      controllers: [EmpresaController],
      providers: [EmpresaHandler, { provide: DB, useValue: dbMock }],
    }).compile();

    controller = moduleRef.get(EmpresaController);
  });

  it('lista las empresas', async () => {
    const rows = [makeRow()];
    all.mockResolvedValue(rows);
    await expect(controller.list()).resolves.toEqual(rows);
  });

  it('obtiene por código', async () => {
    const row = makeRow();
    first.mockResolvedValue(row);
    await expect(controller.getById('E1')).resolves.toEqual(row);
    expect(first).toHaveBeenCalledWith({ CodEmpresa: 'E1' });
  });

  it('responde 404 cuando no existe', async () => {
    first.mockResolvedValue(null);
    await expect(controller.getById('X')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('crea una empresa exitosamente cuando no existe', async () => {
    const row = makeRow();
    first.mockResolvedValue(null);
    create.mockResolvedValue(row);
    await expect(
      controller.create({ CodEmpresa: 'E1', RazonSocial: 'GLD SERVICIOS GENERALES EIRL' }),
    ).resolves.toEqual(row);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ CodEmpresa: 'E1' }));
  });

  it('responde 409 cuando se intenta crear una empresa con código duplicado', async () => {
    const row = makeRow();
    first.mockResolvedValue(row);
    await expect(
      controller.create({ CodEmpresa: 'E1', RazonSocial: 'GLD SERVICIOS GENERALES EIRL' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(create).not.toHaveBeenCalled();
  });

  it('actualiza solo los campos enviados', async () => {
    const row = makeRow();
    update.mockResolvedValue({ ...row, CorreoCompras: 'nuevo@gld.com' });
    await expect(controller.update('E1', { CorreoCompras: 'nuevo@gld.com' })).resolves.toMatchObject(
      { CorreoCompras: 'nuevo@gld.com' },
    );
    expect(update).toHaveBeenCalledWith({ CorreoCompras: 'nuevo@gld.com' });
  });

  it('responde 404 al actualizar una empresa inexistente', async () => {
    update.mockResolvedValue(null);
    await expect(controller.update('X', { CorreoCompras: 'nuevo@gld.com' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('elimina una empresa', async () => {
    remove.mockResolvedValue(makeRow());
    await expect(controller.remove('E1')).resolves.toBeUndefined();
  });

  it('responde 404 al eliminar una inexistente', async () => {
    remove.mockResolvedValue(null);
    await expect(controller.remove('X')).rejects.toBeInstanceOf(NotFoundException);
  });
});