import {
  esHashArgon2,
  hashClave,
  obtenerHashFicticio,
  verificarClave,
} from './passwords.js';

describe('passwords (argon2id)', () => {
  it('genera un hash argon2id distinto en cada llamada (sal aleatoria)', async () => {
    const a = await hashClave('secreta123');
    const b = await hashClave('secreta123');
    expect(a).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('secreta123');
  });

  it('verifica la clave correcta y rechaza la incorrecta', async () => {
    const h = await hashClave('secreta123');
    await expect(verificarClave(h, 'secreta123')).resolves.toBe(true);
    await expect(verificarClave(h, 'Secreta123')).resolves.toBe(false);
  });

  it('nunca compara texto plano: una clave guardada sin hash no valida', async () => {
    await expect(verificarClave('secreta123', 'secreta123')).resolves.toBe(false);
    await expect(verificarClave(null, '')).resolves.toBe(false);
    await expect(verificarClave(undefined, 'x')).resolves.toBe(false);
  });

  it('un hash corrupto devuelve false en vez de lanzar', async () => {
    await expect(verificarClave('$argon2id$basura', 'x')).resolves.toBe(false);
  });

  it('detecta hashes argon2', () => {
    expect(esHashArgon2('$argon2id$v=19$m=1,t=1,p=1$a$b')).toBe(true);
    expect(esHashArgon2('$argon2i$v=19$...')).toBe(true);
    expect(esHashArgon2('123456')).toBe(false);
    expect(esHashArgon2('$2b$10$bcrypt')).toBe(false);
    expect(esHashArgon2(null)).toBe(false);
  });

  it('el hash ficticio es argon2id y se calcula una sola vez', async () => {
    const a = await obtenerHashFicticio();
    expect(esHashArgon2(a)).toBe(true);
    await expect(obtenerHashFicticio()).resolves.toBe(a);
  });
});
