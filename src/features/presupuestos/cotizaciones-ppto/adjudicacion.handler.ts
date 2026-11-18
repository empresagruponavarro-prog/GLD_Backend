import { Inject, Injectable } from '@nestjs/common';
import type { AuthUser } from '../../../platform/auth/jwt/auth-user.js';
import { exigirTrabajadorVinculado, trabajadorDelUsuario } from '../../../platform/auth/usuarios/trabajador-del-usuario.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { AlmacenSql } from '../../almacen/shared/almacen-sql.js';
import { ConciliarCompromisosService } from '../compromisos/conciliar-compromisos.service.js';
import { modoCotizacion } from './adjudicacion.js';
import { aplicarAdjudicacion } from './aplicar-adjudicacion.js';
import { bloquearPresupuesto } from './contexto-ppto.js';
import type { AdjudicacionDto, AdjudicacionResponseDto } from './cotizacion-ppto.dto.js';

/**
 * Elige o quita al ganador de ítems del presupuesto (plan 09, D-3). Quien registra ya aprueba (respuesta 2): basta
 * `presupuestos · editar` y un trabajador vinculado al usuario, que firma lo que se genere.
 */
@Injectable()
export class AdjudicacionHandler {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sql: AlmacenSql,
    private readonly conciliacion: ConciliarCompromisosService,
  ) {}

  async adjudicar(idPresupuesto: number, dto: AdjudicacionDto, user?: AuthUser): Promise<AdjudicacionResponseDto> {
    const r = await this.db.transaction(async (tx) => {
      const ppto = await bloquearPresupuesto(this.sql, tx, idPresupuesto);
      modoCotizacion(ppto.estado);
      if (dto.items.some((i) => i.id_cot_detalle !== null)) {
        if (user) await trabajadorDelUsuario(tx.orm.public, user.id, user.usuario);
        else exigirTrabajadorVinculado(null, '(sin sesión)');
      }
      const resultado = await aplicarAdjudicacion(this.sql, tx, {
        presupuesto: ppto,
        cambios: dto.items.map((i) => ({ idItem: i.id_ppto_item, idCotDetalle: i.id_cot_detalle })),
        usuario: user?.usuario ?? 'SISTEMA',
        comentario: dto.comentario ?? null,
      });
      return { ...resultado, compromisos: await this.conciliacion.conciliar(tx, ppto, user) };
    });
    return { adjudicados: r.adjudicados, liberados: r.liberados, sin_cambio: r.sinCambio, compromisos: r.compromisos };
  }
}
