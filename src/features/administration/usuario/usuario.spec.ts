import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { UsuarioController } from './usuario.controller.js';
import { UsuarioHandler } from './usuario.handler.js';

function makeRow(IdUsuario = 'U-001') {
  return { IdUsuario, Nombres: 'Juan Pérez', Usuario: 'jperez', Clave: '123456', Rol: 'Usuario' };
}

describe('usuario', () => {
  let controller: UsuarioController;
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
          Usuarios: {
            create,
            first,
            orderBy: vi.fn(() => ({
              where: vi.fn(() => ({ all })),
              all,
            })),
            where: vi.fn(() => ({ update, delete: remove })),
            all,
          },
        },
      },
    } as unknown as Database;

    const moduleRef = await Test.createTestingModule({
      controllers: [UsuarioController],
      providers: [UsuarioHandler, { provide: DB, useValue: dbMock }],
    }).compile();

    controller = moduleRef.get(UsuarioController);
  });

  it('lista los usuarios', async () => {
    const rows = [makeRow()];
    all.mockResolvedValue(rows);
    await expect(controller.list()).resolves.toEqual(rows);
  });

  it('obtiene por id', async () => {
    const row = makeRow();
    first.mockResolvedValue(row);
    await expect(controller.getById('U-001')).resolves.toEqual(row);
    expect(first).toHaveBeenCalledWith({ IdUsuario: 'U-001' });
  });

  it('responde 404 cuando no existe', async () => {
    first.mockResolvedValue(null);
    await expect(controller.getById('X')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('crea con clave y rol por defecto cuando no existe', async () => {
    const row = makeRow();
    first.mockResolvedValue(null);
    create.mockResolvedValue(row);
    await expect(
      controller.create({ IdUsuario: 'U-001', Nombres: 'Juan Pérez', Usuario: 'jperez' }),
    ).resolves.toEqual(row);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ IdUsuario: 'U-001', Clave: '123456', Rol: 'Usuario' }),
    );
  });

  it('responde 409 cuando se intenta crear un usuario con ID duplicado', async () => {
    const row = makeRow();
    first.mockResolvedValue(row);
    await expect(
      controller.create({ IdUsuario: 'U-001', Nombres: 'Juan Pérez', Usuario: 'jperez' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(create).not.toHaveBeenCalled();
  });

  it('actualiza solo los campos enviados', async () => {
    const row = makeRow();
    update.mockResolvedValue({ ...row, Rol: 'Admin' });
    await expect(controller.update('U-001', { Rol: 'Admin' })).resolves.toMatchObject({
      Rol: 'Admin',
    });
    expect(update).toHaveBeenCalledWith({ Rol: 'Admin' });
  });

  it('responde 404 al actualizar un usuario inexistente', async () => {
    update.mockResolvedValue(null);
    await expect(controller.update('X', { Rol: 'Admin' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('elimina un usuario', async () => {
    remove.mockResolvedValue(makeRow());
    await expect(controller.remove('U-001')).resolves.toBeUndefined();
  });

  it('responde 404 al eliminar un inexistente', async () => {
    remove.mockResolvedValue(null);
    await expect(controller.remove('X')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deduplica los roles', async () => {
    all.mockResolvedValue([makeRow(), { ...makeRow('U-002'), Rol: 'Admin' }]);
    await expect(controller.getRoles()).resolves.toEqual(['Usuario', 'Admin']);
  });

  it('usa roles por defecto cuando no hay roles', async () => {
    all.mockResolvedValue([{ ...makeRow(), Rol: null }]);
    await expect(controller.getRoles()).resolves.toEqual([
      'Administrador',
      'Promotor',
      'Supervisor',
      'Usuario',
    ]);
  });
});