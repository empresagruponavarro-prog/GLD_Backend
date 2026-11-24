import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { AuthUser } from '../../../platform/auth/jwt/auth-user.js';
import { exigirTrabajadorVinculado, trabajadorDelUsuario } from '../../../platform/auth/usuarios/trabajador-del-usuario.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { AlmacenSql, B, I, sqlTag } from '../../almacen/shared/almacen-sql.js';
import { ConciliarCompromisosService } from '../compromisos/conciliar-compromisos.service.js';
import { modoCotizacion } from './adjudicacion.js';
import { aplicarAdjudicacion } from './aplicar-adjudicacion.js';
import { comentarioConMarca, exigirCotizacionesSuficientes, yaGanaLaSubpartida } from './cotizaciones-suficientes.js';
import { bloquearPresupuesto, itemsDeSubpartida, subpartidaPresupuesto } from './contexto-ppto.js';
import type { AdjudicacionDto, AdjudicacionResponseDto } from './cotizacion-ppto.dto.js';

/**
 * Elige o quita al ganador de una subpartida del presupuesto (plan 09, D-3): la subpartida completa va a un solo proveedor,
 * así que sus ítems con cantidad pasan juntos a la cotización elegida. Quien registra ya aprueba (respuesta 2): basta
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
      const q = sqlTag(this.sql);
      const ppto = await bloquearPresupuesto(this.sql, tx, idPresupuesto);
      modoCotizacion(ppto.estado);
      const subpartida = await subpartidaPresupuesto(this.sql, ppto.codigo, dto.id_detalle_categoria, tx);
      const items = (await itemsDeSubpartida(this.sql, ppto.codigo, subpartida.id, tx)).filter((i) => Number(i.cantidad) > 0);

      const cambios: Array<{ idItem: number; idCotDetalle: number | null }> = [];
      if (dto.id_cotizacion === null) {
        for (const i of items) if (i.id_cot_detalle_ganadora !== null) cambios.push({ idItem: i.id, idCotDetalle: null });
      } else {
        const [cot] = await q.rows<{ id: number }>({ id: I }, tx)`
          SELECT id FROM ppto_cotizacion
           WHERE id = ${dto.id_cotizacion}::int AND id_presupuesto = ${idPresupuesto}::int AND id_detalle_categoria = ${subpartida.id}::int`;
        if (!cot) throw new BadRequestException(`La cotización ${dto.id_cotizacion} no es de la subpartida ${subpartida.nombre}`);
        const lineas = await q.rows<{ id: number; id_ppto_item: number; cotiza: boolean }>({ id: I, id_ppto_item: I, cotiza: B }, tx)`
          SELECT id, id_ppto_item, cotiza FROM ppto_cotizacion_detalle WHERE id_cotizacion = ${cot.id}::int`;
        const lineaDeItem = new Map(lineas.map((l) => [l.id_ppto_item, l]));
        for (const i of items) {
          const l = lineaDeItem.get(i.id);
          if (!l || !l.cotiza) {
            throw new BadRequestException(`La cotización no incluye el ítem ${i.codigo}: no se puede adjudicar la subpartida ${subpartida.nombre} a ese proveedor`);
          }
          cambios.push({ idItem: i.id, idCotDetalle: l.id });
        }
        if (user) await trabajadorDelUsuario(tx.orm.public, user.id, user.usuario);
        else exigirTrabajadorVinculado(null, '(sin sesión)');
        // Regla de 1 o 3 cotizaciones (D-17): solo al cambiar de ganador.
        if (!(await yaGanaLaSubpartida(this.sql, tx, subpartida.id, cot.id))) {
          await exigirCotizacionesSuficientes(this.sql, tx, subpartida.id, cot.id, { sinTres: dto.sin_tres_cotizaciones, motivo: dto.comentario });
        }
      }

      const resultado = await aplicarAdjudicacion(this.sql, tx, {
        presupuesto: ppto,
        cambios,
        usuario: user?.usuario ?? 'SISTEMA',
        comentario: comentarioConMarca(dto.comentario, dto.id_cotizacion !== null && dto.sin_tres_cotizaciones),
      });
      return { ...resultado, compromisos: await this.conciliacion.conciliar(tx, ppto, user) };
    });
    return { adjudicados: r.adjudicados, liberados: r.liberados, sin_cambio: r.sinCambio, compromisos: r.compromisos };
  }
}
