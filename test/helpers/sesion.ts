import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { App } from 'supertest/types';

/**
 * Token de un Administrador sintético para los e2e, firmado con el JWT_SECRET de la app de
 * pruebas. Toda la API exige sesión (guards globales), así que cada petición lo envía.
 */
export function tokenE2E(app: INestApplication<App>): string {
  return app.get(JwtService, { strict: false }).sign({ sub: 'e2e', usuario: 'e2e', rol: 'Administrador' });
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
