import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and } from '@prisma/orm-postgres/orm-client';
import { toDateOnly } from '../shared/obra-shared.js';
import { toVarchar } from '../../../platform/db/varchar-helpers.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { esAdicional, textoLegado } from '../../presupuestos/aprobacion/estados.js';
import { sincronizarPresupuestoCc } from '../../presupuestos/aprobacion/sincronizar-cc.js';
import { cargarPlanosRequeridos, resumenPlanos } from '../planos-requeridos/planos-requeridos.js';
import { cargarAvanceObra } from '../shared/avance-obra.js';
import { registrarEvento } from '../shared/control-avance/registrar-evento.js';
import { assertCentroCosto, hoyLima, readDateOnly } from '../shared/obra-shared.js';
import type { DosierObraDto, LiquidacionObraDto, SeccionDosierDto } from './liquidacion.dto.js';
import { ESTADO_CERRADO, ESTADO_POR_LIQUIDAR, evaluarLiquidacion } from './liquidacion.js';

@Injectable()
export class LiquidacionHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Requisitos de la liquidación y su estado actual. */
  async obtener(idCentroCosto: number, hoy: string = hoyLima()): Promise<LiquidacionObraDto> {
    const cc = await assertCentroCosto(this.db, idCentroCosto);
    const orm = this.db.orm.public;
    const [avance, items] = await Promise.all([cargarAvanceObra(orm, idCentroCosto, hoy), cargarPlanosRequeridos(orm, idCentroCosto)]);
    const planos = resumenPlanos(items);
    const fechaFinReal = cc.fecha_fin_real ? readDateOnly(cc.fecha_fin_real) : null;
    const s = evaluarLiquidacion({ estadoCc: cc.estado ?? null, fechaFinReal, avance, planos });
    return {
      id_centro_costo: idCentroCosto,
      estado_cc: cc.estado ?? null,
      liquidada: s.liquidada,
      fecha_liquidacion: cc.fecha_liquidacion ? readDateOnly(cc.fecha_liquidacion) : null,
      liquidado_por: cc.liquidado_por ?? null,
      fecha_fin_real: fechaFinReal,
      avance_real: avance.configurada ? Math.round(avance.real * 10) / 10 : null,
      puede_liquidar: s.puedeLiquidar,
      requisitos: s.requisitos,
      planos,
    };
  }

  /**
   * Liquida la obra: el centro de costo pasa de POR LIQUIDAR a CERRADO y sus presupuestos aprobados o entregados, a
   * LIQUIDADO (todo en una transacción). Se cambia con una condición sobre el estado, así dos liquidaciones a la vez no
   * se pisan.
   */
  async liquidar(idCentroCosto: number, usuario: string | undefined, hoy: string = hoyLima()): Promise<LiquidacionObraDto> {
    const antes = await this.obtener(idCentroCosto, hoy);
    if (antes.liquidada) throw new ConflictException('La obra ya está liquidada');
    if (!antes.puede_liquidar) {
      const pendientes = antes.requisitos.filter((r) => !r.cumplido);
      throw new ConflictException({ message: `No se puede liquidar: ${pendientes[0].mensaje}`, requisitos: antes.requisitos });
    }
    const quien = usuario ?? 'SISTEMA';

    await this.db.transaction(async (tx) => {
      const orm = tx.orm.public;
      const cc = await orm.CentroCostos
        .where({ id: idCentroCosto, estado: toVarchar<50>(ESTADO_POR_LIQUIDAR) })
        .update({ estado: toVarchar<50>(ESTADO_CERRADO), fecha_liquidacion: toDateOnly(hoy)!, liquidado_por: toVarchar<255>(quien) });
      if (!cc) throw new ConflictException('La obra ya no está POR LIQUIDAR: alguien más la modificó');

      await orm.ppto_Principal
        .where((p) => and(p.id_centro_costo.eq(idCentroCosto), p.estado_ppto.in(['APROBADO', 'ENTREGADO'])))
        .updateAndCount({ estado_ppto: 'LIQUIDADO', Estado: toVarchar<50>(textoLegado('LIQUIDADO')) });
      await sincronizarPresupuestoCc(orm, idCentroCosto);

      await registrarEvento(orm, {
        idCentroCosto,
        tipo: 'ESTADO',
        titulo: 'Obra liquidada',
        detalle: `Centro de costo cerrado el ${hoy}`,
        antes: ESTADO_POR_LIQUIDAR,
        despues: ESTADO_CERRADO,
        severidad: 'good',
        usuario: quien,
      });
    });

    return this.obtener(idCentroCosto, hoy);
  }

  /**
   * Qué entra en el dosier de la obra (GRP S-08): el conjunto de formatos de todas las etapas, que se imprime como un solo
   * PDF. Se entrega cuando están todos los planos obligatorios; si falta alguno es 409.
   */
  async dosier(idCentroCosto: number, hoy: string = hoyLima()): Promise<DosierObraDto> {
    const cc = await assertCentroCosto(this.db, idCentroCosto);
    const orm = this.db.orm.public;
    const [items, pptos, partidas, documentos, planos] = await Promise.all([
      cargarPlanosRequeridos(orm, idCentroCosto),
      orm.ppto_Principal.where({ id_centro_costo: idCentroCosto }).all(),
      orm.obra_partida.where({ id_centro_costo: idCentroCosto }).all(),
      orm.obra_documentos_actas.where({ id_centro_costo: idCentroCosto }).all(),
      orm.obra_planos.where({ id_centro_costo: idCentroCosto, es_vigente: true }).all(),
    ]);
    const resumen = resumenPlanos(items);
    if (!resumen.completo) {
      throw new ConflictException({
        message: `No se puede entregar el dosier: faltan ${resumen.faltantes.length} plano(s) obligatorio(s): ${resumen.faltantes.map((f) => `${f.codigo} ${f.nombre}`).join(', ')}`,
        planos: resumen,
      });
    }

    const vigentes = pptos.filter((p) => p.estado_ppto !== 'ANULADO' && p.IdPresupuesto);
    const codigos = vigentes.map((p) => p.IdPresupuesto as string);
    const principales = vigentes.filter((p) => !esAdicional(p.TipoPpto ?? null, p.Concepto ?? null)).map((p) => p.IdPresupuesto as string);
    const seccion = (s: SeccionDosierDto): SeccionDosierDto => s;
    const secciones: SeccionDosierDto[] = [
      seccion({ codigo: 'PRESUPUESTO_META', titulo: 'Presupuesto Meta', disponible: codigos.length > 0, referencias: codigos, ...(codigos.length === 0 ? { nota: 'El centro de costo no tiene presupuesto' } : {}) }),
      // El Comercial se calcula del Meta Principal y de las cotizaciones ganadoras (SP-16); mientras una fase no tenga ganadora iguala al Meta.
      seccion({
        codigo: 'PRESUPUESTO_COMERCIAL',
        titulo: 'Presupuesto Comercial',
        disponible: principales.length > 0,
        referencias: principales,
        ...(principales.length === 0 ? { nota: 'Se calcula desde el presupuesto Meta Principal, que la obra aún no tiene' } : {}),
      }),
      seccion({ codigo: 'FICHA_OBRA', titulo: 'Ficha técnica de la obra', disponible: true, referencias: [String(idCentroCosto)] }),
      seccion({ codigo: 'INFORME_AVANCE', titulo: 'Informe de avance', disponible: partidas.length > 0, referencias: partidas.map((p) => p.item), ...(partidas.length === 0 ? { nota: 'La obra no tiene partidas' } : {}) }),
      seccion({ codigo: 'PLANOS', titulo: 'Planos', disponible: items.length > 0 || planos.length > 0, referencias: [`${resumen.entregados_obligatorios}/${resumen.obligatorios} obligatorios`, `${planos.length} plano(s) cargado(s)`] }),
      seccion({ codigo: 'DOCUMENTOS', titulo: 'Documentos técnicos y actas', disponible: documentos.length > 0, referencias: [`${documentos.length} documento(s)`] }),
    ];
    return { id_centro_costo: idCentroCosto, nombre_obra: cc.centro_costo ?? `Obra #${idCentroCosto}`, fecha: hoy, secciones, planos: resumen };
  }
}
