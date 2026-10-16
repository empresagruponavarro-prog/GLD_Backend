import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { JwtPayload } from '../../../platform/auth/auth-user.js';
import {
  esHashArgon2,
  obtenerHashFicticio,
  verificarClave,
} from '../../../platform/auth/passwords.js';
import { usuarioInactivo } from '../../../platform/auth/usuario-inactivo.js';
import { buscarUsuariosPorLogin } from '../../../platform/auth/usuarios-login.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { toUsuarioSesion } from '../shared/usuario-sesion.dto.js';
import { LoginDto, LoginResponseDto } from './login.dto.js';

export const CREDENCIALES_INVALIDAS = 'Usuario o contraseña incorrectos';

@Injectable()
export class LoginHandler {
  private readonly logger = new Logger(LoginHandler.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const coincidencias = await buscarUsuariosPorLogin(this.db, dto.usuario);
    if (coincidencias.length > 1) {
      this.logger.warn('Login ambiguo: varios usuarios comparten el mismo login; se rechaza');
    }
    const user = coincidencias.length === 1 ? coincidencias[0] : undefined;
    const hash = user && esHashArgon2(user.Clave) ? user.Clave : undefined;
    if (user && !hash) {
      this.logger.warn(
        `El usuario ${user.IdUsuario} no tiene la clave hasheada; ejecute npm run usuarios:hash-claves`,
      );
    }

    // Siempre se verifica un hash (el ficticio si no hay usuario o clave valida)
    // para que el tiempo de respuesta no delate si el usuario existe.
    const ok = await verificarClave(hash ?? (await obtenerHashFicticio()), dto.clave);
    if (!user || !hash || !ok) {
      throw new UnauthorizedException(CREDENCIALES_INVALIDAS);
    }
    // Solo con la clave correcta se revela que el usuario esta desactivado.
    if (!user.activo) throw usuarioInactivo();

    const sesion = toUsuarioSesion(user);
    const payload: JwtPayload = { sub: sesion.id, usuario: sesion.usuario, rol: sesion.rol };
    const token = await this.jwt.signAsync(payload);
    const { exp } = this.jwt.decode<{ exp: number }>(token);
    return { token, expiraEn: new Date(exp * 1000).toISOString(), usuario: sesion };
  }
}
