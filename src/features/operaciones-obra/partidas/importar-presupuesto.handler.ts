import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { throwIfUniqueViolation } from '../../../platform/db/pg-errors.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { registrarEvento } from '../shared/control-avance/registrar-evento.js';
import { capturarEstructura } from '../shared/capturar-estructura.js';
import { assertCentroCosto, readDateOnly } from '../shared/obra-shared.js';
import { estructuraObra, subpartidasConAvance } from './partidas.handler.js';
import type { ImportarPresupuestoDto, ObraPartidaDto } from './partidas.dto.js';

export interface PresupuestoDisponibleDto {
  id: number;
  id_presupuesto: string | null;
  version: string | null;
  tipo: string | null;
  estado: string | null;
  proyecto: string | null;
  fases: number;
  categorias: number;
}

export interface ResultadoImportacionDto {
  id_presupuesto: number;
  partidas: number;
  subpartidas: number;
  estructura: ObraPartidaDto[];
}

/**
 * RF-OP-08 · Importa la estructura del presupuesto de la obra: cada fase asignada
 * (`ppto_DetalleFases`) pasa a ser una partida y cada categoría (`ppto_DetalleFasesCate`) una
 * subpartida. Los ítems (`01`, `01.01`…) se generan porque el presupuesto no los trae. Las fechas de
 * las subpartidas arrancan con el rango de la obra: Operaciones las ajusta después.
 */
@Injectable()
export class ImportarPresupuestoHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async disponibles(idCentroCosto: number): Promise<PresupuestoDisponibleDto[]> {
    await assertCentroCosto(this.db, idCentroCosto);
    const orm = this.db.orm.public;
    const presupuestos = await orm.ppto_Principal.where({ id_centro_costo: idCentroCosto }).all();
    const salida: PresupuestoDisponibleDto[] = [];
    for (const p of [...presupuestos].sort((a, b) => b.id - a.id)) {
      const [fases, cates] = p.IdPresupuesto
        ? await Promise.all([
            orm.ppto_DetalleFases.where({ IdPresupuesto: p.IdPresupuesto }).all(),
            orm.ppto_DetalleFasesCate.where({ IdPresupuesto: p.IdPresupuesto }).all(),
          ])
        : [[], []];
      salida.push({
        id: p.id,
        id_presupuesto: p.IdPresupuesto ?? null,
        version: p.Version ?? null,
        tipo: p.TipoPpto ?? null,
        estado: p.Estado ?? null,
        proyecto: p.Proyecto ?? null,
        fases: fases.length,
        categorias: cates.length,
      });
    }
    return salida;
  }

  async importar(idCentroCosto: number, dto: ImportarPresupuestoDto, usuario: string): Promise<ResultadoImportacionDto> {
    const cc = await assertCentroCosto(this.db, idCentroCosto);
    const orm = this.db.orm.public;

    if (!cc.fecha_inicio || !cc.fecha_fin_prog) {
      throw new BadRequestException('Defina el inicio y el fin programado de la obra antes de importar (las subpartidas nacen con ese rango)');
    }
    const inicio = readDateOnly(cc.fecha_inicio);
    const fin = readDateOnly(cc.fecha_fin_prog);

    const ppto = await orm.ppto_Principal.first({ id: dto.idPresupuesto });
    if (!ppto || ppto.id_centro_costo !== idCentroCosto || !ppto.IdPresupuesto) {
      throw new BadRequestException(`El presupuesto ${dto.idPresupuesto} no pertenece a esta obra`);
    }
    const codigo = ppto.IdPresupuesto;

    const fases = await orm.ppto_DetalleFases.where({ IdPresupuesto: codigo }).all();
    if (fases.length === 0) throw new BadRequestException('El presupuesto no tiene fases asignadas: no hay estructura que importar');

    const actuales = await orm.obra_partida.where({ id_centro_costo: idCentroCosto }).all();
    if (actuales.length > 0) {
      if (!dto.reemplazar) throw new ConflictException('La obra ya tiene partidas: use reemplazar=true para sustituirlas');
      const subs = await orm.obra_subpartida.where({ id_centro_costo: idCentroCosto }).all();
      if ((await subpartidasConAvance(orm, subs.map((s) => s.id))) > 0) {
        throw new ConflictException('La estructura actual tiene avance registrado: no se puede reemplazar');
      }
    }

    let capturada = { partidas: 0, subpartidas: 0 };
    try {
      await this.db.transaction(async (tx) => {
        const t = tx.orm.public;
        if (actuales.length > 0) await t.obra_partida.where({ id_centro_costo: idCentroCosto }).delete();

        // La misma captura que hace la aprobación del presupuesto (GRP): fase → partida, categoría → subpartida con su monto.
        capturada = await capturarEstructura(t, {
          idCentroCosto,
          ppto: { id: ppto.id, IdPresupuesto: codigo },
          inicio,
          fin,
          modo: 'principal',
        });

        await registrarEvento(t, {
          idCentroCosto,
          tipo: 'ALTA',
          titulo: `Estructura importada del presupuesto ${codigo}`,
          detalle: `${capturada.partidas} partida(s) y ${capturada.subpartidas} subpartida(s)${actuales.length > 0 ? ' (reemplazó la estructura anterior)' : ''}`,
          usuario,
        });
      });
    } catch (e) {
      throwIfUniqueViolation(e, 'Ítem duplicado al importar la estructura');
      throw e;
    }

    return { id_presupuesto: ppto.id, partidas: capturada.partidas, subpartidas: capturada.subpartidas, estructura: await estructuraObra(orm, idCentroCosto) };
  }
}
