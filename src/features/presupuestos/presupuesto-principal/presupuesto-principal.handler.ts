import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, or } from '@prisma/orm-postgres/orm-client';
import { pageParams, toPaginated, type Paginated } from '../../../platform/db/pagination.js';
import { throwIfUniqueViolation } from '../../../platform/db/pg-errors.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { toDecimalString, toVarchar, type Varchar255, type Varchar50 } from '../presupuestos.helpers.js';
import {
  CreatePresupuestoPrincipalDto,
  ListPresupuestoPrincipalQueryDto,
  PresupuestoPrincipalResponseDto,
  UpdatePresupuestoPrincipalDto,
} from './presupuesto-principal.dto.js';

@Injectable()
export class PresupuestoPrincipalHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(query: ListPresupuestoPrincipalQueryDto): Promise<Paginated<PresupuestoPrincipalResponseDto>> {
    const { page, pageSize, offset } = pageParams(query);
    const base = this.db.orm.public.ppto_Principal.orderBy((p) => p.id.desc());

    const collection = hasFilters(query)
      ? base.where((p) =>
          and(
            ...(query.search
              ? [or(p.IdPresupuesto.ilike(`%${query.search}%`), p.Proyecto.ilike(`%${query.search}%`))]
              : []),
            ...(query.CodCentroCto ? [p.CodCentroCto.eq(toVarchar(query.CodCentroCto))] : []),
            ...(query.id_centro_costo ? [p.id_centro_costo.eq(query.id_centro_costo)] : []),
            ...(query.Estado ? [p.Estado.ilike(`%${query.Estado}%`)] : []),
            ...(query.id_empresa ? [p.id_empresa.eq(query.id_empresa)] : []),
            ...(query.periodo ? [p.periodo.eq(query.periodo)] : []),
          ),
        )
      : base;

    const [total, data] = await Promise.all([
      collection.aggregate((agg) => ({ total: agg.count() })),
      collection.limit(pageSize).offset(offset).all(),
    ]);

    return toPaginated(data as unknown as PresupuestoPrincipalResponseDto[], total.total, page, pageSize);
  }

  async getById(idOrCode: string | number): Promise<PresupuestoPrincipalResponseDto> {
    // Always search by IdPresupuesto first, then fallback to numeric id
    let row = await this.db.orm.public.ppto_Principal.first({ IdPresupuesto: toVarchar(String(idOrCode)) });
    if (!row) {
      const numId = Number(idOrCode);
      if (!isNaN(numId)) {
        row = await this.db.orm.public.ppto_Principal.first({ id: numId });
      }
    }

    if (!row) throw new NotFoundException(`Presupuesto "${idOrCode}" no encontrado`);
    return row as unknown as PresupuestoPrincipalResponseDto;
  }

  async getCompleto(idOrCode: string | number) {
    const ppto = await this.getById(idOrCode);
    const idPresupuesto = ppto.IdPresupuesto;
    if (!idPresupuesto) return { ...ppto, centroCosto: null, fases: [], historiales: [] };

const [centroCosto, detallesFases, historiales, todasCategorias, pptoFases, pptoFasesCat] = await Promise.all([
      ppto.id_centro_costo ? this.db.orm.public.CentroCostos.first({ id: ppto.id_centro_costo }) : null,
      this.db.orm.public.ppto_DetalleFases.where((d) => d.IdPresupuesto.eq(toVarchar(idPresupuesto))).all(),
      this.db.orm.public.ppto_Principal_Historial.where((h) => h.IdPresupuesto.eq(toVarchar(idPresupuesto))).all(),
      this.db.orm.public.ppto_DetalleFasesCate.where((c) => c.IdPresupuesto.eq(toVarchar(idPresupuesto))).all(),
      this.db.orm.public.ppto_Fases.all(),
      this.db.orm.public.ppto_FasesCategorias.all(),
    ]);

    const fasesMap = new Map(pptoFases.map(f => [f.IdpptoFase, f]));
    const fasesByNameMap = new Map(pptoFases.map(f => [f.FaseProyecto?.trim().toUpperCase(), f]));
    const catMap = new Map(pptoFasesCat.map(c => [c.IdpptoFaseCategoria, c.Descripcion]));

    const fasesConCategorias = detallesFases.map((fase) => {
      const categorias = todasCategorias.filter((cat) => cat.IdPresupuestoDetalle === fase.IdPresupuestoDetalle).map(cat => ({
        ...cat,
        CategoriaInsumo: cat.IdpptoFaseCategoria ? catMap.get(cat.IdpptoFaseCategoria) || cat.IdpptoFaseCategoria : null
      }));
      const faseMaestra = (fase.IdpptoFase ? fasesMap.get(fase.IdpptoFase) : null)
        ?? (fase.IdpptoFase ? fasesByNameMap.get(fase.IdpptoFase.trim().toUpperCase()) : null);
      return {
        ...fase,
        id_fase: faseMaestra?.id ?? null,
        NombreFase: faseMaestra?.FaseProyecto || fase.IdpptoFase || null,
        categorias,
      };
    });

    return {
      ...ppto,
      centroCosto,
      fases: fasesConCategorias,
      historiales,
    };
  }

  async create(dto: CreatePresupuestoPrincipalDto): Promise<PresupuestoPrincipalResponseDto> {
    const idCentroCosto = await this.resolveCentroCostoId(dto);

    // Obtener el cliente (CodigoAnexo) desde CentroCostos si no viene en el DTO
    let ccRow: any = null;
    if (idCentroCosto) {
      ccRow = await this.db.orm.public.CentroCostos.first({ id: idCentroCosto });
    }
    const codigoAnexo = (dto.CodigoAnexo || ccRow?.cod_cliente || null);

    // Autogenerar IdPresupuesto si no viene del frontend
    const idPresupuesto = ((dto.IdPresupuesto ?? '').trim()) || (await generateIdPresupuesto(this.db));

    const { subTotal, igv, total, gastosGenerales, utilidad } = calculateAmounts(dto);

    try {
      const created = await this.db.orm.public.ppto_Principal.create({
        IdPresupuesto: toVarchar(idPresupuesto),
        id_empresa: dto.id_empresa,
        periodo: dto.periodo,
        Version: toVarchar(dto.Version ?? 'V1'),
        CodigoAnexo: toVarchar(codigoAnexo),
        TipoPpto: toVarchar(dto.TipoPpto),
        Proyecto: toVarchar(dto.Proyecto),
        Concepto: dto.Concepto,
        CodCentroCtoPrincipal: toVarchar(dto.CodCentroCtoPrincipal),
        CodCentroCto: toVarchar(dto.CodCentroCto),
        id_centro_costo: idCentroCosto,
        FechaRequerimiento: toVarchar(dto.FechaRequerimiento),
        FechaEntrega: toVarchar(dto.FechaEntrega),
        CostoDirecto: toDecimalString(dto.CostoDirecto ?? 0),
        GGPorcentaje: toDecimalString(dto.GGPorcentaje ?? 0),
        GastosGenerales: toDecimalString(gastosGenerales),
        UtiliPorcentaje: toDecimalString(dto.UtiliPorcentaje ?? 0),
        Utilidad: toDecimalString(utilidad),
        Viaticos: toDecimalString(dto.Viaticos ?? 0),
        DsctoComercial: toDecimalString(dto.DsctoComercial ?? 0),
        SubTotalSinIGV: toDecimalString(subTotal),
        IGV: toDecimalString(igv),
        Total: toDecimalString(total),
        Estado: toVarchar<50>(dto.Estado ?? 'PENDIENTE'),
        Comentarios: dto.Comentarios,
        Usuario: toVarchar(dto.Usuario),
        FechaCreacion: toVarchar(new Date().toISOString()),
      });

      await this.db.orm.public.ppto_Principal_Historial.create({
        IdPresupuesto: toVarchar(idPresupuesto),
        IdPresupuestoVersion: toVarchar(`${idPresupuesto}-V1`),
        NumVersion: toVarchar('1'),
      }).catch(() => null);

      if (idCentroCosto) {
        await this.syncCentroCostoPresupuesto(idCentroCosto).catch(() => null);
      }
      return created as unknown as PresupuestoPrincipalResponseDto;
    } catch (error) {
      throwIfUniqueViolation(error, `El IdPresupuesto "${idPresupuesto}" ya existe`);
      throw error;
    }
  }

  async update(idOrCode: string | number, dto: UpdatePresupuestoPrincipalDto): Promise<PresupuestoPrincipalResponseDto> {
    const idCentroCosto = await this.resolveCentroCostoId(dto);

    // Always search by IdPresupuesto first, then fallback to numeric id
    let current = await this.db.orm.public.ppto_Principal.first({ IdPresupuesto: toVarchar(String(idOrCode)) });
    if (!current) {
      const numId = Number(idOrCode);
      if (!isNaN(numId)) {
        current = await this.db.orm.public.ppto_Principal.first({ id: numId });
      }
    }
    if (!current) throw new NotFoundException(`Presupuesto "${idOrCode}" no encontrado`);
    const id = current.id;
    if (!current) throw new NotFoundException(`Presupuesto ${id} no encontrado`);

    const merged = {
      CostoDirecto: dto.CostoDirecto ?? Number(current.CostoDirecto ?? 0),
      GGPorcentaje: dto.GGPorcentaje ?? Number(current.GGPorcentaje ?? 0),
      GastosGenerales: dto.GastosGenerales ?? Number(current.GastosGenerales ?? 0),
      UtiliPorcentaje: dto.UtiliPorcentaje ?? Number(current.UtiliPorcentaje ?? 0),
      Utilidad: dto.Utilidad ?? Number(current.Utilidad ?? 0),
      Viaticos: dto.Viaticos ?? Number(current.Viaticos ?? 0),
      DsctoComercial: dto.DsctoComercial ?? Number(current.DsctoComercial ?? 0),
    };

    const { subTotal, igv, total, gastosGenerales, utilidad } = calculateAmounts(merged);

    const data: {
      IdPresupuesto?: Varchar255;
      id_empresa?: number;
      periodo?: number;
      Version?: Varchar255;
      CodigoAnexo?: Varchar255;
      TipoPpto?: Varchar255;
      Proyecto?: Varchar255;
      Concepto?: string;
      CodCentroCtoPrincipal?: Varchar255;
      CodCentroCto?: Varchar255;
      id_centro_costo?: number;
      FechaRequerimiento?: Varchar255;
      FechaEntrega?: Varchar255;
      CostoDirecto?: string;
      GGPorcentaje?: string;
      GastosGenerales?: string;
      UtiliPorcentaje?: string;
      Utilidad?: string;
      Viaticos?: string;
      DsctoComercial?: string;
      SubTotalSinIGV?: string;
      IGV?: string;
      Total?: string;
      Estado?: Varchar50;
      Comentarios?: string;
      Usuario?: Varchar255;
    } = {};

    if (dto.IdPresupuesto !== undefined) data.IdPresupuesto = toVarchar(dto.IdPresupuesto);
    if (dto.id_empresa !== undefined) data.id_empresa = dto.id_empresa;
    if (dto.periodo !== undefined) data.periodo = dto.periodo;
    if (dto.Version !== undefined) data.Version = toVarchar(dto.Version);
    if (dto.CodigoAnexo !== undefined) data.CodigoAnexo = toVarchar(dto.CodigoAnexo);
    if (dto.TipoPpto !== undefined) data.TipoPpto = toVarchar(dto.TipoPpto);
    if (dto.Proyecto !== undefined) data.Proyecto = toVarchar(dto.Proyecto);
    if (dto.Concepto !== undefined) data.Concepto = dto.Concepto;
    if (dto.CodCentroCtoPrincipal !== undefined) data.CodCentroCtoPrincipal = toVarchar(dto.CodCentroCtoPrincipal);
    if (dto.CodCentroCto !== undefined) data.CodCentroCto = toVarchar(dto.CodCentroCto);
    if (idCentroCosto !== undefined) data.id_centro_costo = idCentroCosto;
    if (dto.FechaRequerimiento !== undefined) data.FechaRequerimiento = toVarchar(dto.FechaRequerimiento);
    if (dto.FechaEntrega !== undefined) data.FechaEntrega = toVarchar(dto.FechaEntrega);
    if (dto.Estado !== undefined) data.Estado = toVarchar<50>(dto.Estado);
    if (dto.Comentarios !== undefined) data.Comentarios = dto.Comentarios;
    if (dto.Usuario !== undefined) data.Usuario = toVarchar(dto.Usuario);

    data.CostoDirecto = toDecimalString(merged.CostoDirecto);
    data.GGPorcentaje = toDecimalString(merged.GGPorcentaje);
    data.GastosGenerales = toDecimalString(gastosGenerales);
    data.UtiliPorcentaje = toDecimalString(merged.UtiliPorcentaje);
    data.Utilidad = toDecimalString(utilidad);
    data.Viaticos = toDecimalString(merged.Viaticos);
    data.DsctoComercial = toDecimalString(merged.DsctoComercial);
    data.SubTotalSinIGV = toDecimalString(subTotal);
    data.IGV = toDecimalString(igv);
    data.Total = toDecimalString(total);

    try {
      const updated = await this.db.orm.public.ppto_Principal.where({ id }).update(data);
      if (!updated) throw new NotFoundException(`Presupuesto ${id} no encontrado`);
      const targetCCId = idCentroCosto ?? current.id_centro_costo;
      if (targetCCId) {
        await this.syncCentroCostoPresupuesto(targetCCId).catch(() => null);
      }
      return updated as unknown as PresupuestoPrincipalResponseDto;
    } catch (error) {
      throwIfUniqueViolation(error, `El IdPresupuesto ya existe`);
      throw error;
    }
  }

  async remove(idOrCode: string | number): Promise<{ deleted: boolean; id: number; code: string | null }> {
    // Always search by IdPresupuesto first, then fallback to numeric id
    let ppto = await this.db.orm.public.ppto_Principal.first({ IdPresupuesto: toVarchar(String(idOrCode)) });
    if (!ppto) {
      const numId = Number(idOrCode);
      if (!isNaN(numId)) {
        ppto = await this.db.orm.public.ppto_Principal.first({ id: numId });
      }
    }
    if (!ppto) throw new NotFoundException(`Presupuesto "${idOrCode}" no encontrado`);

    const idPresupuesto = ppto.IdPresupuesto;
    if (idPresupuesto) {
      await this.db.orm.public.ppto_DetalleFasesCate.where((c) => c.IdPresupuesto.eq(toVarchar(idPresupuesto))).delete();
      await this.db.orm.public.ppto_DetalleFases.where((d) => d.IdPresupuesto.eq(toVarchar(idPresupuesto))).delete();
      await this.db.orm.public.ppto_Principal_Historial.where((h) => h.IdPresupuesto.eq(toVarchar(idPresupuesto))).delete();
    }

    await this.db.orm.public.ppto_Principal.where({ id: ppto.id }).delete();
    return { deleted: true, id: ppto.id, code: ppto.IdPresupuesto };
  }

  
  async syncCentroCostoPresupuesto(idCentroCosto: number): Promise<void> {
    try {
      const [pptos, fases] = await Promise.all([
        this.db.orm.public.ppto_Principal.where((p) => p.id_centro_costo.eq(idCentroCosto)).all(),
        this.db.orm.public.ppto_DetalleFases.where((f) => f.id_centro_costo.eq(idCentroCosto)).all(),
      ]);
      const cdPpto = pptos.reduce((acc, p) => acc + (Number(p.CostoDirecto) || 0), 0);
      const cdFases = fases.reduce((acc, f) => acc + (Number(f.CostoDirecto) || 0), 0);
      const totalCD = Math.max(cdPpto, cdFases);
      const lastEstado = pptos.find((p) => p.Estado)?.Estado ?? 'ABIERTO';

      await this.db.orm.public.CentroCostos
        .where((c) => c.id.eq(idCentroCosto))
        .update({
          presupuesto_monto: toDecimalString(totalCD),
          presupuesto_costo_directo: toDecimalString(totalCD),
          presupuesto_estado: toVarchar<50>(lastEstado),
        });
    } catch {
      // Non-blocking sync
    }
  }

  private async resolveCentroCostoId(dto: {
    id_centro_costo?: number;
  }): Promise<number | undefined> {
    if (dto.id_centro_costo === undefined) return undefined;
    const byId = await this.db.orm.public.CentroCostos.first({ id: dto.id_centro_costo });
    if (!byId) throw new BadRequestException(`El Centro de Costo id "${dto.id_centro_costo}" no existe`);
    return byId.id;
  }
}

function hasFilters(query: ListPresupuestoPrincipalQueryDto): boolean {
  return (
    query.search !== undefined ||
    query.CodCentroCto !== undefined ||
    query.id_centro_costo !== undefined ||
    query.Estado !== undefined ||
    query.id_empresa !== undefined ||
    query.periodo !== undefined
  );
}


  function calculateAmounts(dto: {
  CostoDirecto?: number;
  GGPorcentaje?: number;
  GastosGenerales?: number;
  UtiliPorcentaje?: number;
  Utilidad?: number;
  Viaticos?: number;
  DsctoComercial?: number;
}) {
  const cd = Number(dto.CostoDirecto ?? 0);
  const ggPct = Number(dto.GGPorcentaje ?? 0);
  const gg = dto.GastosGenerales !== undefined && dto.GastosGenerales > 0 ? Number(dto.GastosGenerales) : (cd * ggPct) / 100;
  const utPct = Number(dto.UtiliPorcentaje ?? 0);
  const ut = dto.Utilidad !== undefined && dto.Utilidad > 0 ? Number(dto.Utilidad) : (cd * utPct) / 100;
  const viat = Number(dto.Viaticos ?? 0);
  const dscto = Number(dto.DsctoComercial ?? 0);

  const subTotal = Math.max(0, cd + gg + ut + viat - dscto);
  const igv = subTotal * 0.18;
  const total = subTotal + igv;

  return {
    subTotal: Number(subTotal.toFixed(2)),
    igv: Number(igv.toFixed(2)),
    total: Number(total.toFixed(2)),
    gastosGenerales: Number(gg.toFixed(2)),
    utilidad: Number(ut.toFixed(2)),
  };
}
// Genera un ID único para el presupuesto: PPTO-{año}-{correlativo 3 dígitos}
async function generateIdPresupuesto(db: Database): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PPTO-${year}-`;
  const rows = await db.orm.public.ppto_Principal
    .where((p) => p.IdPresupuesto.ilike(`${prefix}%`))
    .all();
  let maxNum = 0;
  for (const row of rows) {
    const last = row.IdPresupuesto ?? '';
    const parts = last.split('-');
    const num = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(num) && num > maxNum) {
      maxNum = num;
    }
  }
  return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
}
