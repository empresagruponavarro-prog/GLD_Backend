import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { App } from 'supertest/types';

/** `IdUsuario` del Administrador temporal de los e2e (fuera del correlativo `USR-NNNN`). */
export const USUARIO_E2E = 'E2E-ADMIN';

/** Lo único que los helpers necesitan del cliente `pg` de cada spec. */
interface ClienteSql {
  query(text: string, values?: unknown[]): Promise<unknown>;
}

/**
 * Crea (o reactiva) el Administrador temporal de los e2e. Desde la etapa A de permisos el
 * `JwtAuthGuard` exige que el `sub` del token exista y esté activo en `usuarios`, así que un
 * token sintético sin fila recibe 401. Sin `Clave`: no puede iniciar sesión por el login.
 */
export async function crearUsuarioE2E(db: ClienteSql): Promise<void> {
  await db.query('DELETE FROM usuarios WHERE "IdUsuario" = $1', [USUARIO_E2E]);
  await db.query(
    `INSERT INTO usuarios ("IdUsuario", "Nombres", "Usuario", "Rol", "Clave", activo)
     VALUES ($1, 'Administrador e2e (temporal)', 'e2e-admin', 'Administrador', NULL, true)`,
    [USUARIO_E2E],
  );
}

/** Borra el Administrador temporal de los e2e (en el `afterAll`). */
export async function borrarUsuarioE2E(db: ClienteSql): Promise<void> {
  await db.query('DELETE FROM usuarios WHERE "IdUsuario" = $1', [USUARIO_E2E]);
}

/**
 * Token del Administrador temporal de los e2e ({@link crearUsuarioE2E}), firmado con el
 * JWT_SECRET de la app de pruebas. Toda la API exige sesión (guards globales), así que cada
 * petición lo envía.
 */
export function tokenE2E(app: INestApplication<App>): string {
  return app.get(JwtService, { strict: false }).sign({ sub: USUARIO_E2E, usuario: 'e2e-admin', rol: 'Administrador' });
}

/** Cliente supertest que envía `Authorization: Bearer` en cada petición. */
export function apiConSesion(app: INestApplication<App>) {
  const server = app.getHttpServer();
  const auth = `Bearer ${tokenE2E(app)}`;
  return {
    get: (url: string) => request(server).get(url).set('Authorization', auth),
    post: (url: string) => request(server).post(url).set('Authorization', auth),
    put: (url: string) => request(server).put(url).set('Authorization', auth),
    patch: (url: string) => request(server).patch(url).set('Authorization', auth),
    delete: (url: string) => request(server).delete(url).set('Authorization', auth),
  };
}
