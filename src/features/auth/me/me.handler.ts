import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Varchar } from '@prisma/orm-postgres/target/codec-types';
import { SESION_INVALIDA } from '../../../platform/auth/jwt-auth.guard.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { toUsuarioSesion, UsuarioSesionDto } from '../shared/usuario-sesion.dto.js';

@Injectable()
export class MeHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Lee el usuario de la BD (rol vigente); si fue borrado la sesion deja de valer. */
  async me(id: string): Promise<UsuarioSesionDto> {
    const row = await this.db.orm.public.Usuarios.first({
      IdUsuario: id as unknown as Varchar<255>,
    });
    if (!row) throw new UnauthorizedException(SESION_INVALIDA);
    return toUsuarioSesion(row);
  }
}
