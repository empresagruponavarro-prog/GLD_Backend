import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { throwIfUniqueViolation } from '../../../platform/db/pg-errors.js';
import { toVarchar } from '../../../platform/db/varchar-helpers.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { registrarEvento } from '../shared/control-avance/registrar-evento.js';
import { assertCentroCosto, readDateOnly, toDateOnly } from '../shared/obra-shared.js';
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

const dos = (n: number) => String(n).padStart(2, '0');

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

    const [fases, cates] = await Promise.all([
      orm.ppto_DetalleFases.where({ IdPresupuesto: codigo }).all(),
      orm.ppto_DetalleFasesCate.where({ IdPresupuesto: codigo }).all(),
    ]);
    if (fases.length === 0) throw new BadRequestException('El presupuesto no tiene fases asignadas: no hay estructura que importar');

    const actuales = await orm.obra_partida.where({ id_centro_costo: idCentroCosto }).all();
    if (actuales.length > 0) {
      if (!dto.reemplazar) throw new ConflictException('La obra ya tiene partidas: use reemplazar=true para sustituirlas');
      const subs = await orm.obra_subpartida.where({ id_centro_costo: idCentroCosto }).all();
      if ((await subpartidasConAvance(orm, subs.map((s) => s.id))) > 0) {
        throw new ConflictException('La estructura actual tiene avance registrado: no se puede reemplazar');
      }
    }

    // Nombres: la fase y la categoría del catálogo maestro.
    const codigosFase = [...new Set(fases.map((f) => f.IdpptoFase).filter((c): c is NonNullable<typeof c> => !!c))];
    const codigosCat = [...new Set(cates.map((c) => c.IdpptoFaseCategoria).filter((c): c is NonNullable<typeof c> => !!c))];
    const [maestroFases, maestroCats] = await Promise.all([
      codigosFase.length ? orm.ppto_Fases.where((f) => f.IdpptoFase.in(codigosFase)).all() : [],
      codigosCat.length ? orm.ppto_FasesCategorias.where((c) => c.IdpptoFaseCategoria.in(codigosCat)).all() : [],
    ]);
    const nombreFase = new Map(maestroFases.map((f) => [f.IdpptoFase, f.FaseProyecto]));
    const nombreCat = new Map(maestroCats.map((c) => [c.IdpptoFaseCategoria, c.Descripcion]));

    const fasesOrdenadas = [...fases].sort((a, b) => a.id - b.id);
    let totalSub = 0;

    try {
      await this.db.transaction(async (tx) => {
        const t = tx.orm.public;
        if (actuales.length > 0) await t.obra_partida.where({ id_centro_costo: idCentroCosto }).delete();

        let pOrden = 0;
        for (const fase of fasesOrdenadas) {
          pOrden++;
          const itemPartida = dos(pOrden);
          const partida = await t.obra_partida.create({
            id_centro_costo: idCentroCosto,
            item: toVarchar<20>(itemPartida),
            nombre: toVarchar<150>((nombreFase.get(fase.IdpptoFase) ?? `Fase ${pOrden}`).trim().slice(0, 150)),
            tipo: 'CONTRACTUAL',
            orden: pOrden,
            id_ppto_detalle_fase: fase.id,
          });
          const delaFase = cates.filter((c) => c.IdPresupuestoDetalle === fase.IdPresupuestoDetalle).sort((a, b) => a.id - b.id);
          let sOrden = 0;
          for (const cat of delaFase) {
            sOrden++;
            totalSub++;
            await t.obra_subpartida.create({
              id_partida: partida.id,
              id_centro_costo: idCentroCosto,
              item: toVarchar<20>(`${itemPartida}.${dos(sOrden)}`),
              nombre: toVarchar<150>((nombreCat.get(cat.IdpptoFaseCategoria) ?? `Partida ${itemPartida}.${dos(sOrden)}`).trim().slice(0, 150)),
              fecha_inicio: toDateOnly(inicio)!,
              fecha_fin: toDateOnly(fin)!,
              orden: sOrden,
              id_ppto_detalle_categoria: cat.id,
            });
          }
        }

        const gen = await t.obra_datos_generales.first({ id_centro_costo: idCentroCosto });
        if (gen) await t.obra_datos_generales.where({ id: gen.id }).update({ id_presupuesto_origen: ppto.id });
        else await t.obra_datos_generales.create({ id_centro_costo: idCentroCosto, id_presupuesto_origen: ppto.id });

        await registrarEvento(t, {
          idCentroCosto,
          tipo: 'ALTA',
          titulo: `Estructura importada del presupuesto ${codigo}`,
          detalle: `${fasesOrdenadas.length} partida(s) y ${totalSub} subpartida(s)${actuales.length > 0 ? ' (reemplazó la estructura anterior)' : ''}`,
          usuario,
        });
      });
    } catch (e) {
      throwIfUniqueViolation(e, 'Ítem duplicado al importar la estructura');
      throw e;
    }

    return { id_presupuesto: ppto.id, partidas: fasesOrdenadas.length, subpartidas: totalSub, estructura: await estructuraObra(orm, idCentroCosto) };
  }
}
