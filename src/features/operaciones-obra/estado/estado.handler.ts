import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { nowInstant } from '../../../platform/db/temporal.js';
import { toVarchar } from '../../../platform/db/varchar-helpers.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { truncar } from '../shared/control-avance/avance.js';
import { cargarObra } from '../shared/control-avance/carga-obra.js';
import type { EstadoObra } from '../shared/control-avance/control-avance.types.js';
import { calcularObra } from '../shared/control-avance/motor.js';
import { registrarEvento } from '../shared/control-avance/registrar-evento.js';
import { assertCentroCosto, esFechaIso, hoyLima, readDateOnly, toDateOnly } from '../shared/obra-shared.js';
import type { CambiarEstadoObraDto, CambioEstadoObraDto } from './estado.dto.js';

/**
 * Transiciones permitidas (RF-OP-20). `null` = la obra aún no participa del Dashboard.
 * Culminada y cancelada son finales. Entregar = pasar a POST_VENTA; cerrar la post venta = CULMINADO.
 */
export const TRANSICIONES_ESTADO: Readonly<Record<EstadoObra | 'NINGUNO', readonly EstadoObra[]>> = {
  NINGUNO: ['PROXIMO', 'EN_EJECUCION'],
  PROXIMO: ['EN_EJECUCION', 'SUSPENDIDA', 'CANCELADA'],
  EN_EJECUCION: ['POST_VENTA', 'SUSPENDIDA', 'CANCELADA'],
  POST_VENTA: ['CULMINADO'],
  SUSPENDIDA: ['PROXIMO', 'EN_EJECUCION', 'CANCELADA'],
  CULMINADO: [],
  CANCELADA: [],
};

const ETIQUETA: Record<EstadoObra, string> = {
  PROXIMO: 'Próximo proyecto',
  EN_EJECUCION: 'En ejecución',
  POST_VENTA: 'Post venta',
  CULMINADO: 'Culminado',
  SUSPENDIDA: 'Suspendida',
  CANCELADA: 'Cancelada',
};

@Injectable()
export class EstadoHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async cambiar(idCentroCosto: number, dto: CambiarEstadoObraDto, usuario: string, hoy: string = hoyLima()): Promise<CambioEstadoObraDto> {
    const nuevo = dto.estado as EstadoObra;
    const cc = await assertCentroCosto(this.db, idCentroCosto);
    const orm = this.db.orm.public;
    const gen = await orm.obra_datos_generales.first({ id_centro_costo: idCentroCosto });
    const actual = (gen?.estado_obra ?? null) as EstadoObra | null;

    if (actual === nuevo) throw new ConflictException(`La obra ya está en estado ${ETIQUETA[nuevo]}`);
    if (!TRANSICIONES_ESTADO[actual ?? 'NINGUNO'].includes(nuevo)) {
      const permitidas = TRANSICIONES_ESTADO[actual ?? 'NINGUNO'].map((e) => ETIQUETA[e]).join(', ') || 'ninguno (estado final)';
      throw new ConflictException(`No se puede pasar de ${actual ? ETIQUETA[actual] : 'sin estado'} a ${ETIQUETA[nuevo]}. Cambios permitidos: ${permitidas}`);
    }

    const carga = await cargarObra(orm, idCentroCosto);
    const avisos: string[] = [];

    // Alta en el Dashboard: la ficha tiene que estar completa (RV-01…RV-03).
    if (actual === null) {
      const faltan: string[] = [];
      if (!gen?.codigo_obra) faltan.push('código de obra');
      if (!cc.id_anexo) faltan.push('cliente del centro de costo');
      if (!gen?.tienda) faltan.push('tienda / sede');
      if (!gen?.departamento) faltan.push('departamento');
      if (!gen?.id_jefe_proyecto) faltan.push('jefe de proyecto');
      if (!carga.inicio) faltan.push('fecha de inicio');
      if (!carga.fin) faltan.push('fecha de fin programado');
      if (faltan.length > 0) throw new BadRequestException(`Complete la ficha operativa antes de iniciar el control: falta ${faltan.join(', ')}`);
      if (carga.inicio && carga.fin && carga.fin < carga.inicio) throw new BadRequestException('El fin programado es anterior al inicio');
    }

    const fecha = dto.fecha ?? hoy;
    if (!esFechaIso(fecha)) throw new BadRequestException(`Fecha inválida: ${fecha}`);
    const observaciones = dto.observaciones?.trim() || null;

    const cambiosGen: Record<string, unknown> = {};
    const cambiosCc: Record<string, unknown> = {};

    if (nuevo === 'POST_VENTA') {
      if (carga.inicio && fecha < carga.inicio) throw new BadRequestException('La entrega no puede ser anterior al inicio de la obra');
      const real = carga.entrada ? truncar(calcularObra(carga.entrada, hoy).real) : 0;
      if (real < 100) {
        if (!dto.confirmar) {
          throw new ConflictException(`La obra está al ${real} % de avance: confirme la entrega con confirmar=true o complete el avance (RV-17)`);
        }
        avisos.push(`Entregada sin el 100 % de avance (${real} %)`);
      }
      cambiosCc.fecha_fin_real = toDateOnly(fecha);
      if (observaciones) cambiosGen.observaciones_postventa = toVarchar<200>(observaciones);
    }

    if (nuevo === 'CULMINADO') {
      const entrega = cc.fecha_fin_real ? readDateOnly(cc.fecha_fin_real) : null;
      if (entrega && fecha < entrega) throw new BadRequestException('El cierre de la post venta no puede ser anterior a la entrega (RV-20)');
      cambiosGen.fecha_cierre_postventa = toDateOnly(fecha);
      if (observaciones) cambiosGen.observaciones_postventa = toVarchar<200>(observaciones);
    }

    await this.db.transaction(async (tx) => {
      const t = tx.orm.public;
      if (Object.keys(cambiosCc).length) await t.CentroCostos.where({ id: idCentroCosto }).update(cambiosCc);
      await t.obra_datos_generales.where({ id_centro_costo: idCentroCosto }).update({
        estado_obra: nuevo,
        actualizado_por: toVarchar<255>(usuario),
        updated_at: nowInstant(),
        ...cambiosGen,
      });
      await registrarEvento(t, {
        idCentroCosto,
        tipo: actual === null ? 'ALTA' : 'ESTADO',
        titulo: actual === null ? `Obra incorporada al control: ${ETIQUETA[nuevo]}` : `Estado: ${ETIQUETA[actual]} → ${ETIQUETA[nuevo]}`,
        detalle: [nuevo === 'POST_VENTA' || nuevo === 'CULMINADO' ? `Fecha ${fecha}` : null, observaciones, ...avisos].filter(Boolean).join(' · ') || null,
        antes: actual ? ETIQUETA[actual] : null,
        despues: ETIQUETA[nuevo],
        severidad: nuevo === 'CANCELADA' || nuevo === 'SUSPENDIDA' ? 'warn' : nuevo === 'CULMINADO' || nuevo === 'POST_VENTA' ? 'good' : 'info',
        usuario,
      });
    });

    return { anterior: actual, estado: nuevo, fecha, avisos };
  }
}
