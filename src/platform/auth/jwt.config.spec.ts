import { JWT_EXPIRA_SEGUNDOS, jwtModuleOptions, leerJwtSecret } from './jwt.config.js';

describe('jwt.config', () => {
  it('exige JWT_SECRET con al menos 32 caracteres', () => {
    expect(() => leerJwtSecret({})).toThrow(/JWT_SECRET/);
    expect(() => leerJwtSecret({ JWT_SECRET: '' })).toThrow(/JWT_SECRET/);
    expect(() => leerJwtSecret({ JWT_SECRET: 'a'.repeat(31) })).toThrow(/32 caracteres/);
    expect(leerJwtSecret({ JWT_SECRET: 'a'.repeat(32) })).toBe('a'.repeat(32));
  });

  it('configura HS256 con expiracion de 8 h', () => {
    const opts = jwtModuleOptions({ JWT_SECRET: 'b'.repeat(64) });
    expect(JWT_EXPIRA_SEGUNDOS).toBe(28_800);
    expect(opts.signOptions).toEqual({ algorithm: 'HS256', expiresIn: 28_800 });
    expect(opts.verifyOptions).toEqual({ algorithms: ['HS256'] });
  });
});
