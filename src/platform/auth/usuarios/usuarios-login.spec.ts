import type { Database } from '../../../prisma/prisma.module.js';
import { buscarUsuariosPorLogin, normalizarLogin } from './usuarios-login.js';

function fila(IdUsuario: string, Usuario: string | null) {
  return { IdUsuario, Nombres: null, Usuario, Clave: null, Rol: 'Usuario' };
}

describe('buscarUsuariosPorLogin', () => {
  const all = vi.fn();
  const ilike = vi.fn();
  const where = vi.fn((cb: (u: unknown) => unknown) => {
    cb({ Usuario: { ilike } });
    return { all };
  });
  const db = { orm: { public: { Usuarios: { where } } } } as unknown as Database;

  beforeEach(() => vi.clearAllMocks());

  it('normaliza con trim y minusculas', () => {
    expect(normalizarLogin('  JPerez ')).toBe('jperez');
    expect(normalizarLogin(null)).toBe('');
  });

  it('compara sin distinguir mayusculas ni espacios extremos', async () => {
    all.mockResolvedValue([fila('1', ' JPEREZ '), fila('2', 'jperez2'), fila('3', null)]);
    const res = await buscarUsuariosPorLogin(db, '  jPerez');
    expect(res.map((u) => u.IdUsuario)).toEqual(['1']);
    expect(ilike).toHaveBeenCalledWith('%jPerez%');
  });

  it('escapa los comodines de LIKE', async () => {
    all.mockResolvedValue([]);
    await buscarUsuariosPorLogin(db, 'a_b%c\\d');
    expect(ilike).toHaveBeenCalledWith('%a\\_b\\%c\\\\d%');
  });

  it('un login vacio no consulta la BD', async () => {
    await expect(buscarUsuariosPorLogin(db, '   ')).resolves.toEqual([]);
    expect(where).not.toHaveBeenCalled();
  });
});
