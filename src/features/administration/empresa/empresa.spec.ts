import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { EmpresaController } from './empresa.controller.js';
import { EmpresaHandler } from './empresa.handler.js';

function makeRow(id_empresa = 1) {
  return {
    id_empresa,
    ruc: '20123456789',
    razon_social: 'GLD SERVICIOS GENERALES EIRL',
    domicilio_fiscal: 'Av. Lima 100',
    direccion_entrega: 'Av. Lima 100',
    correo_compras: 'compras@gld.com',
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

  it('obtiene por id', async () => {
    const row = makeRow();
    first.mockResolvedValue(row);
    await expect(controller.getById('1')).resolves.toEqual(row);
    expect(first).toHaveBeenCalledWith({ id_empresa: 1 });
  });

  it('responde 404 cuando no existe', async () => {
    first.mockResolvedValue(null);
    await expect(controller.getById('999')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('crea una empresa exitosamente', async () => {
    const row = makeRow();
    create.mockResolvedValue(row);
    await expect(
      controller.create({ ruc: '20123456789', razon_social: 'GLD SERVICIOS GENERALES EIRL' }),
    ).resolves.toEqual(row);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ razon_social: 'GLD SERVICIOS GENERALES EIRL' }));
  });

  it('actualiza solo los campos enviados', async () => {
    const row = makeRow();
    update.mockResolvedValue({ ...row, correo_compras: 'nuevo@gld.com' });
    await expect(controller.update('1', { correo_compras: 'nuevo@gld.com' })).resolves.toMatchObject(
      { correo_compras: 'nuevo@gld.com' },
    );
    expect(update).toHaveBeenCalledWith({ correo_compras: 'nuevo@gld.com' });
  });

  it('responde 404 al actualizar una empresa inexistente', async () => {
    update.mockResolvedValue(null);
    await expect(controller.update('999', { correo_compras: 'nuevo@gld.com' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('elimina una empresa', async () => {
    remove.mockResolvedValue(makeRow());
    await expect(controller.remove('1')).resolves.toBeUndefined();
  });

  it('responde 404 al eliminar una inexistente', async () => {
    remove.mockResolvedValue(null);
    await expect(controller.remove('999')).rejects.toBeInstanceOf(NotFoundException);
  });
});