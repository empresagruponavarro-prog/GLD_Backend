import 'reflect-metadata';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { aMayusculas } from './mayusculas.js';
import { SIN_MAYUSCULAS_KEY } from './sin-mayusculas.decorator.js';

const METODOS_CON_CUERPO = new Set(['POST', 'PUT', 'PATCH']);
/** `RouteParamtypes.BODY` de Nest: las claves de los argumentos de ruta son `<tipo>:<índice>`. */
const TIPO_BODY = 3;

/** DTO del `@Body()` de un método de controlador (`undefined` si el parámetro no es una clase). */
export function dtoDelCuerpo(controlador: Function, metodo: string): Function | undefined {
  const argumentos = Reflect.getMetadata(ROUTE_ARGS_METADATA, controlador, metodo) as Record<string, { index: number }> | undefined;
  const clave = Object.keys(argumentos ?? {}).find((k) => k.startsWith(`${TIPO_BODY}:`));
  if (!argumentos || clave === undefined) return undefined;
  const tipos = Reflect.getMetadata('design:paramtypes', controlador.prototype, metodo) as unknown[] | undefined;
  const tipo = tipos?.[argumentos[clave].index];
  return typeof tipo === 'function' && tipo !== Object && tipo !== Array ? tipo : undefined;
}

/**
 * Convierte a mayúsculas los textos del cuerpo de las peticiones de escritura (GRP S-11). Va como interceptor global porque
 * se ejecuta **antes** de los pipes: `ValidationPipe` ya recibe el cuerpo convertido. Una ruta o un controlador puede
 * excluirse con `@SinMayusculas()`; ver `mayusculas.ts` para las claves y los campos que nunca se convierten.
 */
@Injectable()
export class MayusculasInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      const excluida = this.reflector.getAllAndOverride<boolean | undefined>(SIN_MAYUSCULAS_KEY, [context.getHandler(), context.getClass()]);
      const request = context.switchToHttp().getRequest<{ method: string; body?: unknown }>();
      if (!excluida && METODOS_CON_CUERPO.has(request.method) && request.body !== undefined && request.body !== null) {
        request.body = aMayusculas(request.body, dtoDelCuerpo(context.getClass(), context.getHandler().name));
      }
    }
    return next.handle();
  }
}
