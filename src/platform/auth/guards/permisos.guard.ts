import {
  Injectable,
  Logger,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
  type OnModuleInit,
} from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { AuditoriaPermisosService } from '../permisos/auditoria-permisos.js';
import type { RequestConUsuario } from '../jwt/auth-user.js';
import { SESION_INVALIDA } from './jwt-auth.guard.js';
import { MODULOS_ADMINISTRACION, type Accion } from '../permisos/permisos.js';
import { LECTURA_COMPARTIDA_KEY, accionDeMetodo, moduloDeClase, tambienDesdeDeMetodo } from '../decorators/permisos.decorator.js';
import { leerModoPermisos, type ModoPermisos } from '../permisos/permisos-modo.js';
import { PermisosRolService } from '../permisos/permisos-rol.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { rutaSinModulo, sinPermiso } from '../usuarios/sin-permiso.js';

const ACCION_POR_VERBO: Readonly<Record<string, Accion>> = {
  GET: 'ver',
  HEAD: 'ver',
  POST: 'crear',
  PUT: 'editar',
  PATCH: 'editar',
  DELETE: 'eliminar',
};

/** Acción deducida del verbo HTTP (`undefined` para un verbo sin acción, p. ej. OPTIONS). */
export function accionPorVerbo(metodo: string): Accion | undefined {
  return ACCION_POR_VERBO[metodo.toUpperCase()];
}

/** Segmentos de un `path` de Nest (string o lista; se toma el primero). */
function segmentos(valor: unknown): string[] {
  const path = Array.isArray(valor) ? valor[0] : valor;
  if (typeof path !== 'string') return [];
  return path.split('/').filter((s) => s !== '');
}

/** Ruta declarada (`/requerimientos/:id/aprobar`): prefijo del controlador + path del método. */
export function rutaDeclarada(reflector: Reflector, context: ExecutionContext): string {
  const partes = [
    ...segmentos(reflector.get<unknown>(PATH_METADATA, context.getClass())),
    ...segmentos(reflector.get<unknown>(PATH_METADATA, context.getHandler())),
  ];
  return `/${partes.join('/')}`;
}

interface RequestPermisos extends RequestConUsuario {
  method?: string;
}

/**
 * Permisos por módulo en la API (plan 05 §7.2). Corre tras `JwtAuthGuard`, que deja en
 * `request.user` el rol DE LA BD. Orden: `@Public` → pasa; sin usuario → 401;
 * `@LecturaCompartida` → pasa; Administrador (rol de sistema) → pasa; sin `@Modulo` en la clase →
 * 403 (error de configuración); la acción en el módulo de la clase o, si el método tiene
 * `@TambienDesde`, en alguno de esos módulos (activos) → pasa; si no → negativa (registrada con el
 * módulo de la clase). La negativa se
 * registra siempre (JSONL + log) y se aplica con 403 en modo `estricto` o, en cualquier modo,
 * en el grupo Administración.
 */
@Injectable()
export class PermisosGuard implements CanActivate, OnModuleInit {
  private readonly logger = new Logger('Permisos');
  readonly modo: ModoPermisos;
  private readonly modoInvalido: string | null;

  constructor(
    private readonly reflector: Reflector,
    private readonly permisosRol: PermisosRolService,
    private readonly auditoria: AuditoriaPermisosService,
  ) {
    const leido = leerModoPermisos(process.env);
    this.modo = leido.modo;
    this.modoInvalido = leido.invalido;
  }

  onModuleInit(): void {
    if (this.modoInvalido !== null) {
      this.logger.warn(`PERMISOS_MODO="${this.modoInvalido}" no es válido (auditoria|estricto); se usa "${this.modo}"`);
    }
    if (this.modo === 'auditoria') {
      this.logger.warn(
        'Permisos en modo AUDITORÍA: las negativas se registran en logs/permisos-auditoria.jsonl y NO se bloquean (salvo Administración)',
      );
    } else {
      this.logger.warn('Permisos en modo ESTRICTO: las negativas responden 403');
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const objetivos = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, objetivos)) return true;

    const req = context.switchToHttp().getRequest<RequestPermisos>();
    const user = req.user;
    if (!user) throw new UnauthorizedException(SESION_INVALIDA);

    if (this.reflector.getAllAndOverride<boolean | undefined>(LECTURA_COMPARTIDA_KEY, objetivos)) return true;

    const permisos = await this.permisosRol.obtenerParaUsuario(user);
    if (permisos.esAdministrador) return true;

    const controlador = context.getClass().name;
    const handler = context.getHandler().name;
    const clave = moduloDeClase(this.reflector, context.getClass());
    const metodo = (req.method ?? '').toUpperCase();
    const accion = accionDeMetodo(this.reflector, context.getHandler()) ?? accionPorVerbo(metodo);
    if (!clave || !accion) {
      this.logger.error(
        `Configuración de permisos incompleta en ${controlador}.${handler} (${clave ? 'verbo sin acción' : 'sin @Modulo'}): se niega`,
      );
      throw rutaSinModulo();
    }

    const modulo = permisos.modulos.get(clave);
    if (modulo?.activo && modulo.permisos[accion]) return true;
    // `@TambienDesde`: la misma acción en un módulo alternativo (activo) también vale.
    for (const alternativa of tambienDesdeDeMetodo(this.reflector, context.getHandler())) {
      const otro = permisos.modulos.get(alternativa);
      if (otro?.activo && otro.permisos[accion]) return true;
    }

    const aplicado = this.modo === 'estricto' || MODULOS_ADMINISTRACION.includes(clave);
    const ruta = rutaDeclarada(this.reflector, context);
    this.auditoria.registrar({
      fecha: new Date().toISOString(),
      modo: this.modo,
      aplicado,
      usuario: user.id,
      rol: user.rol,
      modulo: clave,
      accion,
      metodo,
      ruta,
      controlador,
      handler,
    });
    this.logger.warn(
      `${aplicado ? 'Negado' : 'Se negaría (auditoría)'}: ${user.id} [${user.rol}] ${accion} ${clave} — ${metodo} ${ruta}`,
    );
    if (aplicado) throw sinPermiso(accion, modulo?.nombre ?? clave, clave);
    return true;
  }
}
