import 'dotenv/config';
import type { JwtModuleOptions } from '@nestjs/jwt';

/** Vigencia del token: 8 horas. */
export const JWT_EXPIRA_SEGUNDOS = 8 * 60 * 60;
export const JWT_ALGORITMO = 'HS256' as const;
export const JWT_SECRET_MIN = 32;

/**
 * Lee y valida `JWT_SECRET`. Se ejecuta al arrancar (factory de JwtModule):
 * si falta o es corto, el servidor no levanta.
 */
export function leerJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env['JWT_SECRET']?.trim() ?? '';
  if (secret.length < JWT_SECRET_MIN) {
    throw new Error(
      `JWT_SECRET no esta definido o tiene menos de ${JWT_SECRET_MIN} caracteres. ` +
        'Agreguelo a .env (vea .env.example); por ejemplo: ' +
        `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    );
  }
  return secret;
}

export function jwtModuleOptions(env: NodeJS.ProcessEnv = process.env): JwtModuleOptions {
  return {
    secret: leerJwtSecret(env),
    signOptions: { algorithm: JWT_ALGORITMO, expiresIn: JWT_EXPIRA_SEGUNDOS },
    verifyOptions: { algorithms: [JWT_ALGORITMO] },
  };
}
