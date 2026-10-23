import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { esHashArgon2, verificarClave } from '../../../platform/auth/usuarios/passwords.js';
import { SesionUsuariosService } from '../../../platform/auth/usuarios/sesion-usuarios.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { UsuarioController } from './usuario.controller.js';
import { CreateUsuarioDto, UpdateUsuarioDto } from './usuario.dto.js';
import { siguienteIdUsuario } from '../../../platform/auth/usuarios/usuarios-id.js';
import { UsuarioHandler } from './usuario.handler.js';

const HASH = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA';

function makeRow(IdUsuario = 'U-001', over: Record<string, unknown> = {}) {
  return { IdUsuario, Nombres: 'Juan Pérez', Usuario: 'jperez', Clave: HASH, Rol: 'Usuario', activo: true, id_area: null, ...over };
}

const nuevo = {
  Nombres: 'Juan Pérez',
  Usuario: 'jperez',
  Clave: 'secreta123',
  Rol: 'Usuario',
};

/** Respuesta esperada de un usuario sin área ni excepciones propias. */
const respuesta = (IdUsuario: string) => ({
  IdUsuario,
  Nombres: 'Juan Pérez',
  Usuario: 'jperez',
  Rol: 'Usuario',
  activo: true,
  id_area: null,
  area: null,
  tiene_permisos_personalizados: false,
});

const pipe = new ValidationPipe({ whitelist: true, transform: true });
const validar = (metatype: new () => object, value: object) =>
  pipe.transform(value, { type: 'body', metatype });

describe('usuario', () => {
  let controller: UsuarioController;
  const create = vi.fn();
  const first = vi.fn();
  const all = vi.fn();
  const buscar = vi.fn();
  const update = vi.fn();
  const remove = vi.fn();
  const rolFirst = vi.fn();
  const rolAll = vi.fn();
  const areaFirst = vi.fn();
  const areaAll = vi.fn();
  const permisoFirst = vi.fn();
  const permisoAll = vi.fn();
  const sesiones = { invalidar: vi.fn(), invalidarTodo: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    buscar.mockResolvedValue([]);
    all.mockResolvedValue([]);
    // Por defecto el rol enviado existe en la tabla rol.
    rolFirst.mockImplementation(async ({ nombre }: { nombre: string }) => ({ id: 1, nombre }));
    rolAll.mockResolvedValue([]);
    // Por defecto el área pedida existe, ninguna otra cosa tiene excepciones propias.
    areaFirst.mockImplementation(async ({ id }: { id: number }) => ({ id, codigo: 'PROCURA', nombre: 'Procura' }));
    areaAll.mockResolvedValue([]);
    permisoFirst.mockResolvedValue(null);
    permisoAll.mockResolvedValue([]);

    const dbMock = {
      // Las operaciones que tocan el rol o borran van en transacción: aquí corre sobre el mismo mock.
      transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(dbMock)),
      orm: {
        public: {
          Usuarios: {
            create,
            first,
            orderBy: vi.fn(() => ({ all })),
            // where({ IdUsuario }) -> update/delete; where(cb) -> busqueda por login
            where: vi.fn(() => ({ update, delete: remove, all: buscar })),
            all,
          },
          rol: {
            first: rolFirst,
            // Roles de sistema: ninguno en estos casos (las reglas del último Administrador se prueban en usuario-estado.spec).
            where: vi.fn(() => ({ all: async () => [] })),
            orderBy: vi.fn(() => ({ all: rolAll })),
          },
          area: { first: areaFirst, all: areaAll },
          usuario_permiso: { first: permisoFirst, all: permisoAll },
        },
      },
    } as unknown as Database;

    const moduleRef = await Test.createTestingModule({
      controllers: [UsuarioController],
      providers: [
        UsuarioHandler,
        { provide: DB, useValue: dbMock },
        { provide: SesionUsuariosService, useValue: sesiones },
      ],
    }).compile();

    controller = moduleRef.get(UsuarioController);
  });

  describe('respuestas sin Clave', () => {
    it('lista los usuarios sin Clave', async () => {
      all.mockResolvedValue([makeRow(), makeRow('U-002', { Clave: '123456' })]);
      const res = await controller.list();
      expect(res).toEqual([
        { ...respuesta('U-001') },
        { ...respuesta('U-002') },
      ]);
      for (const u of res) expect(u).not.toHaveProperty('Clave');
    });

    it('obtiene por id sin Clave', async () => {
      first.mockResolvedValue(makeRow());
      const res = await controller.getById('U-001');
      expect(res).not.toHaveProperty('Clave');
      expect(res.IdUsuario).toBe('U-001');
      expect(first).toHaveBeenCalledWith({ IdUsuario: 'U-001' });
    });

    it('create y update no devuelven Clave', async () => {
      first.mockResolvedValue(null);
      create.mockResolvedValue(makeRow());
      expect(await controller.create({ ...nuevo })).not.toHaveProperty('Clave');
      update.mockResolvedValue(makeRow());
      expect(await controller.update('U-001', { Clave: 'otraClave99' })).not.toHaveProperty(
        'Clave',
      );
    });
  });

  it('responde 404 cuando no existe', async () => {
    first.mockResolvedValue(null);
    await expect(controller.getById('X')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('crea guardando la clave con argon2id y el rol indicado', async () => {
    first.mockResolvedValue(null);
    create.mockResolvedValue(makeRow());
    await controller.create({ ...nuevo, Usuario: ' jperez ' });

    const data = create.mock.calls[0][0];
    expect(data).toMatchObject({ IdUsuario: 'USR-0001', Usuario: 'jperez', Rol: 'Usuario', activo: true });
    expect(esHashArgon2(data.Clave)).toBe(true);
    expect(data.Clave).not.toBe('123456');
    await expect(verificarClave(data.Clave, 'secreta123')).resolves.toBe(true);
  });

  it('asigna el siguiente correlativo ignorando los ids con otro formato', async () => {
    all.mockResolvedValue([makeRow('USR-0007'), makeRow('dscs'), makeRow('bf4c756c-c1e1-45a5'), makeRow('USR-0002')]);
    create.mockResolvedValue(makeRow('USR-0008'));
    await expect(controller.create({ ...nuevo })).resolves.toMatchObject({ IdUsuario: 'USR-0008' });
    expect(create.mock.calls[0][0].IdUsuario).toBe('USR-0008');
  });

  it('ignora un IdUsuario enviado por el cliente', async () => {
    const dto = await validar(CreateUsuarioDto, { ...nuevo, IdUsuario: 'ELEGIDO-A-MANO' });
    expect(dto).not.toHaveProperty('IdUsuario');
    create.mockResolvedValue(makeRow('USR-0001'));
    await controller.create(dto as CreateUsuarioDto);
    expect(create.mock.calls[0][0].IdUsuario).toBe('USR-0001');
  });

  it('responde 409 con login duplicado sin distinguir mayusculas', async () => {
    first.mockResolvedValue(null);
    buscar.mockResolvedValue([makeRow('U-009', { Usuario: 'JPEREZ' })]);
    await expect(controller.create({ ...nuevo, Usuario: 'jPerez' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('si otra alta tomó el mismo número (23505) reintenta con el siguiente', async () => {
    all.mockResolvedValueOnce([]).mockResolvedValueOnce([makeRow('USR-0001')]);
    create
      .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }))
      .mockResolvedValueOnce(makeRow('USR-0002'));
    await expect(controller.create({ ...nuevo })).resolves.toMatchObject({ IdUsuario: 'USR-0002' });
    expect(create.mock.calls.map((c) => c[0].IdUsuario)).toEqual(['USR-0001', 'USR-0002']);
  });

  it('tras 5 choques seguidos responde 409', async () => {
    create.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
    await expect(controller.create({ ...nuevo })).rejects.toBeInstanceOf(ConflictException);
    expect(create).toHaveBeenCalledTimes(5);
  });

  it('otros errores de la BD no se reintentan', async () => {
    create.mockRejectedValue(new Error('conexion perdida'));
    await expect(controller.create({ ...nuevo })).rejects.toThrow('conexion perdida');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it.each([
    [[], 'USR-0001'],
    [['USR-0001', 'USR-0002'], 'USR-0003'],
    [['USR-0009', 'USR-0010'], 'USR-0011'],
    [['admin', 'U-001', 'dscs'], 'USR-0001'],
    [['USR-9999'], 'USR-10000'],
    [[' USR-0004 '], 'USR-0005'],
  ])('siguienteIdUsuario(%j) = %s', (ids, esperado) => {
    expect(siguienteIdUsuario(ids)).toBe(esperado);
  });

  it('actualiza solo los campos enviados', async () => {
    first.mockResolvedValue(makeRow());
    update.mockResolvedValue(makeRow('U-001', { Rol: 'Supervisor' }));
    await expect(controller.update('U-001', { Rol: 'Supervisor' })).resolves.toMatchObject({
      Rol: 'Supervisor',
    });
    expect(update).toHaveBeenCalledWith({ Rol: 'Supervisor' });
  });

  it('update re-hashea la clave', async () => {
    update.mockResolvedValue(makeRow());
    await controller.update('U-001', { Clave: 'nuevaClave1' });
    const data = update.mock.calls[0][0];
    expect(Object.keys(data)).toEqual(['Clave']);
    expect(esHashArgon2(data.Clave)).toBe(true);
    await expect(verificarClave(data.Clave, 'nuevaClave1')).resolves.toBe(true);
  });

  it('update permite conservar el propio login y rechaza el de otro (409)', async () => {
    update.mockResolvedValue(makeRow());
    buscar.mockResolvedValue([makeRow('U-001')]);
    await expect(controller.update('U-001', { Usuario: 'JPEREZ' })).resolves.toBeTruthy();

    buscar.mockResolvedValue([makeRow('U-002')]);
    await expect(controller.update('U-001', { Usuario: 'jperez' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('responde 404 al actualizar un usuario inexistente', async () => {
    update.mockResolvedValue(null);
    await expect(controller.update('X', { Rol: 'Usuario' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('elimina un usuario e invalida su sesión en caché', async () => {
    first.mockResolvedValue(makeRow());
    remove.mockResolvedValue(makeRow());
    await expect(controller.remove('U-001', { id: 'ADM', usuario: 'adm', rol: 'Administrador' })).resolves.toBeUndefined();
    expect(sesiones.invalidar).toHaveBeenCalledWith('U-001');
  });

  it('update invalida la sesión en caché (el rol vigente se lee de la BD)', async () => {
    first.mockResolvedValue(makeRow());
    update.mockResolvedValue(makeRow('U-001', { Rol: 'Supervisor' }));
    await controller.update('U-001', { Rol: 'Supervisor' });
    expect(sesiones.invalidar).toHaveBeenCalledWith('U-001');
  });

  it('un update que no encuentra el usuario no invalida nada', async () => {
    update.mockResolvedValue(null);
    await expect(controller.update('X', { Nombres: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    expect(sesiones.invalidar).not.toHaveBeenCalled();
  });

  it('responde 404 al eliminar un inexistente', async () => {
    remove.mockResolvedValue(null);
    await expect(controller.remove('X', { id: 'ADM', usuario: 'adm', rol: 'Administrador' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('GET /administration/usuarios/roles devuelve los nombres de la tabla rol (sistema primero, luego por nombre)', async () => {
    // La consulta llega ordenada por nombre; el handler sube los de sistema.
    rolAll.mockResolvedValue([
      { id: 7, nombre: 'Almacenero', descripcion: null, es_sistema: false },
      { id: 2, nombre: 'Promotor', descripcion: null, es_sistema: false },
      { id: 1, nombre: 'Zeta Admin', descripcion: null, es_sistema: true },
    ]);
    await expect(controller.getRoles()).resolves.toEqual(['Zeta Admin', 'Almacenero', 'Promotor']);
  });

  describe('el Rol se valida contra la tabla rol', () => {
    it('create con rol inexistente → 400 y no crea', async () => {
      rolFirst.mockResolvedValue(null);
      const error = await controller.create({ ...nuevo, Rol: 'Fantasma' }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toBe('El rol "Fantasma" no existe');
      expect(rolFirst).toHaveBeenCalledWith({ nombre: 'Fantasma' });
      expect(create).not.toHaveBeenCalled();
    });

    it('update con rol inexistente → 400 y no actualiza', async () => {
      rolFirst.mockResolvedValue(null);
      await expect(controller.update('U-001', { Rol: 'Fantasma' })).rejects.toThrow('El rol "Fantasma" no existe');
      expect(update).not.toHaveBeenCalled();
    });

    it('un rol creado en la tabla (fuera del antiguo catálogo fijo) se acepta', async () => {
      create.mockResolvedValue(makeRow('USR-0001', { Rol: 'Almacenero' }));
      await expect(controller.create({ ...nuevo, Rol: 'Almacenero' })).resolves.toMatchObject({ Rol: 'Almacenero' });
      expect(rolFirst).toHaveBeenCalledWith({ nombre: 'Almacenero' });
      expect(create.mock.calls[0][0].Rol).toBe('Almacenero');

      first.mockResolvedValue(makeRow());
      update.mockResolvedValue(makeRow('U-001', { Rol: 'Almacenero' }));
      await expect(controller.update('U-001', { Rol: 'Almacenero' })).resolves.toMatchObject({ Rol: 'Almacenero' });
    });

    it('update sin Rol no consulta la tabla rol', async () => {
      update.mockResolvedValue(makeRow());
      await controller.update('U-001', { Nombres: 'Otro' });
      expect(rolFirst).not.toHaveBeenCalled();
    });
  });

  describe('validacion (ValidationPipe)', () => {
    it('acepta un create valido', async () => {
      await expect(validar(CreateUsuarioDto, nuevo)).resolves.toBeInstanceOf(CreateUsuarioDto);
    });

    it.each([
      ['sin Clave', { ...nuevo, Clave: undefined }],
      ['Clave corta', { ...nuevo, Clave: '1234567' }],
      ['Clave de mas de 128', { ...nuevo, Clave: 'x'.repeat(129) }],
      ['sin Rol', { ...nuevo, Rol: undefined }],
      ['Rol vacío', { ...nuevo, Rol: '' }],
      ['Rol de más de 50', { ...nuevo, Rol: 'x'.repeat(51) }],
      ['Rol no string', { ...nuevo, Rol: 5 }],
    ])('create %s -> 400', async (_caso, body) => {
      await expect(validar(CreateUsuarioDto, body)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('update acepta cuerpo parcial', async () => {
      await expect(validar(UpdateUsuarioDto, { Nombres: 'X' })).resolves.toBeInstanceOf(
        UpdateUsuarioDto,
      );
    });

    it.each([
      ['Clave corta', { Clave: 'corta' }],
      ['Rol vacío', { Rol: '' }],
      ['Rol de más de 50', { Rol: 'x'.repeat(51) }],
      ['Usuario vacio', { Usuario: '' }],
    ])('update %s -> 400', async (_caso, body) => {
      await expect(validar(UpdateUsuarioDto, body)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('área del usuario (plan 08)', () => {
    it('create con área existente la guarda y la devuelve', async () => {
      first.mockResolvedValue(null);
      create.mockResolvedValue(makeRow('USR-0001', { id_area: 7 }));
      const res = await controller.create({ ...nuevo, id_area: 7 });
      expect(create.mock.calls[0][0]).toMatchObject({ id_area: 7 });
      expect(res).toMatchObject({ id_area: 7, area: { id: 7, codigo: 'PROCURA', nombre: 'Procura' } });
    });

    it('create sin área la deja en null (alcance global)', async () => {
      first.mockResolvedValue(null);
      create.mockResolvedValue(makeRow('USR-0001'));
      const res = await controller.create({ ...nuevo });
      expect(create.mock.calls[0][0]).toMatchObject({ id_area: null });
      expect(res).toMatchObject({ id_area: null, area: null });
    });

    it('create con un área que no existe -> 400 y no crea nada', async () => {
      areaFirst.mockResolvedValue(null);
      await expect(controller.create({ ...nuevo, id_area: 999 })).rejects.toBeInstanceOf(BadRequestException);
      expect(create).not.toHaveBeenCalled();
    });

    it('update cambia el área y descarta la sesión en caché', async () => {
      update.mockResolvedValue(makeRow('U-001', { id_area: 7 }));
      const res = await controller.update('U-001', { id_area: 7 });
      expect(update).toHaveBeenCalledWith({ id_area: 7 });
      expect(res.area).toEqual({ id: 7, codigo: 'PROCURA', nombre: 'Procura' });
      expect(sesiones.invalidar).toHaveBeenCalledWith('U-001');
    });

    it('update con id_area null quita el área', async () => {
      update.mockResolvedValue(makeRow('U-001'));
      const res = await controller.update('U-001', { id_area: null });
      expect(update).toHaveBeenCalledWith({ id_area: null });
      expect(res).toMatchObject({ id_area: null, area: null });
    });

    it('update con un área que no existe -> 400', async () => {
      areaFirst.mockResolvedValue(null);
      await expect(controller.update('U-001', { id_area: 999 })).rejects.toBeInstanceOf(BadRequestException);
      expect(update).not.toHaveBeenCalled();
    });

    it('la lista trae el área de cada usuario y marca a quienes tienen excepciones propias', async () => {
      all.mockResolvedValue([makeRow('U-001', { id_area: 7 }), makeRow('U-002')]);
      areaAll.mockResolvedValue([{ id: 7, codigo: 'PROCURA', nombre: 'Procura' }]);
      permisoAll.mockResolvedValue([{ usuario_id: 'U-002' }]);
      const res = await controller.list();
      expect(res[0]).toMatchObject({ IdUsuario: 'U-001', area: { id: 7, nombre: 'Procura' }, tiene_permisos_personalizados: false });
      expect(res[1]).toMatchObject({ IdUsuario: 'U-002', area: null, tiene_permisos_personalizados: true });
    });

    it('rechaza un id_area no entero en el DTO', async () => {
      await expect(validar(CreateUsuarioDto, { ...nuevo, id_area: 'x' })).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});