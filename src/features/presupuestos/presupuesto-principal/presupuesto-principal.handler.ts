import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, or } from '@prisma/orm-postgres/orm-client';
import { pageParams, toPaginated, type Paginated } from '../../../platform/db/pagination.js';
import { throwIfUniqueViolation } from '../../../platform/db/pg-errors.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { toDecimalString, toVarchar, type Varchar255, type Varchar50 } from '../../../platform/db/valores.js';
import {
  CreatePresupuestoPrincipalDto,
  FaseFurPreviewDto,
  FurGeneradoItemDto,
  GenerarFursPresupuestoDto,
  GenerarFursPresupuestoResponseDto,
  ListPresupuestoPrincipalQueryDto,
  PresupuestoPrincipalResponseDto,
  PreviewFursPresupuestoResponseDto,
  UpdatePresupuestoPrincipalDto,
} from './presupuesto-principal.dto.js';
import type { AuthUser } from '../../../platform/auth/auth-user.js';

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

const [centroCosto, detallesFases, historiales, todasCategorias, pptoFases, pptoFasesCat, dbCategorias, itemsPresupuesto] = await Promise.all([
      ppto.id_centro_costo ? this.db.orm.public.CentroCostos.first({ id: ppto.id_centro_costo }) : null,
      this.db.orm.public.ppto_DetalleFases.where((d) => d.IdPresupuesto.eq(toVarchar(idPresupuesto))).all(),
      this.db.orm.public.ppto_Principal_Historial.where((h) => h.IdPresupuesto.eq(toVarchar(idPresupuesto))).all(),
      this.db.orm.public.ppto_DetalleFasesCate.where((c) => c.IdPresupuesto.eq(toVarchar(idPresupuesto))).all(),
      this.db.orm.public.ppto_Fases.all(),
      this.db.orm.public.ppto_FasesCategorias.all(), this.db.orm.public.categoria.all(),
      this.db.orm.public.ppto_DetalleItems.where((i) => i.IdPresupuesto.eq(toVarchar(idPresupuesto))).all(),
    ]);

    const fasesMap = new Map(pptoFases.map(f => [f.IdpptoFase, f]));
    const fasesByNameMap = new Map(pptoFases.map(f => [f.FaseProyecto?.trim().toUpperCase(), f]));
    const catMap = new Map(pptoFasesCat.map(c => [c.IdpptoFaseCategoria, c.Descripcion])); const catRealMap = new Map(dbCategorias.map(c => [c.id, c]));
    const itemsPorPartida = new Map<number, number>();
    for (const it of itemsPresupuesto) {
      itemsPorPartida.set(it.id_detalle_categoria, (itemsPorPartida.get(it.id_detalle_categoria) ?? 0) + 1);
    }

    const fasesConCategorias = detallesFases.map((fase) => {
      const categorias = todasCategorias.filter((cat) => cat.IdPresupuestoDetalle === fase.IdPresupuestoDetalle).map(cat => ({
        ...cat,
        CategoriaInsumo: cat.IdpptoFaseCategoria ? catMap.get(cat.IdpptoFaseCategoria) || cat.IdpptoFaseCategoria : null,
          Descripcion: cat.IdpptoFaseCategoria ? catMap.get(cat.IdpptoFaseCategoria) || cat.IdpptoFaseCategoria : '(Categoria vacia)', categoria: cat.id_categoria ? catRealMap.get(cat.id_categoria) : null,
        totalItems: itemsPorPartida.get(cat.id) ?? 0,
      }));
      const faseMaestra = (fase.IdpptoFase ? fasesMap.get(fase.IdpptoFase) : null)
        ?? (fase.IdpptoFase ? fasesByNameMap.get(fase.IdpptoFase.trim().toUpperCase()) : null);
            const sumCategorias = categorias.reduce((acc, c) => acc + (Number(c.CostoDirecto) || 0), 0);
      const costoDirectoCalculado = categorias.length > 0 ? toDecimalString(sumCategorias) : (fase.CostoDirecto || '0.00');
      return {
        ...fase,
        CostoDirecto: costoDirectoCalculado,
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

  async create(dto: CreatePresupuestoPrincipalDto, usuarioAuth?: string): Promise<PresupuestoPrincipalResponseDto> {
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
        Usuario: toVarchar(dto.Usuario || usuarioAuth),
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

  async previewFursPorFase(idOrCode: string | number): Promise<PreviewFursPresupuestoResponseDto> {
    const ppto = await this.getById(idOrCode);
    const idPresupuesto = ppto.IdPresupuesto;
    if (!idPresupuesto) {
      throw new BadRequestException(`El presupuesto no tiene un código IdPresupuesto válido`);
    }
    if (!ppto.id_centro_costo) {
      throw new BadRequestException(`El presupuesto debe estar vinculado a un Centro de Costos para generar requerimientos (FURs)`);
    }

    const [cc, detallesFases, todasCategorias, pptoFases, itemsPresupuesto, todosProductos, todasUnidades, fursExistentes] = await Promise.all([
      this.db.orm.public.CentroCostos.first({ id: ppto.id_centro_costo }),
      this.db.orm.public.ppto_DetalleFases.where((d) => d.IdPresupuesto.eq(toVarchar(idPresupuesto))).all(),
      this.db.orm.public.ppto_DetalleFasesCate.where((c) => c.IdPresupuesto.eq(toVarchar(idPresupuesto))).all(),
      this.db.orm.public.ppto_Fases.all(),
      this.db.orm.public.ppto_DetalleItems.where((i) => i.IdPresupuesto.eq(toVarchar(idPresupuesto))).all(),
      this.db.orm.public.producto.all(),
      this.db.orm.public.unidad_medida.all(),
      this.db.orm.public.requerimiento.where((r) => r.id_centro_costo.eq(ppto.id_centro_costo!)).all(),
    ]);

    const prodMap = new Map(todosProductos.map((p) => [p.id, p]));
    const umMap = new Map(todasUnidades.map((u) => [u.id, u.simbolo || u.codigo || 'UND']));
    const fasesMap = new Map(pptoFases.map((f) => [f.IdpptoFase, f]));
    const fasesByNameMap = new Map(pptoFases.map((f) => [f.FaseProyecto?.trim().toUpperCase(), f]));

    const catToDetalleFase = new Map(todasCategorias.map((c) => [c.id, c.IdPresupuestoDetalle]));

    const furPorFaseMap = new Map<number, { id: number; numero: string; estado: string }>();
    for (const r of fursExistentes) {
      if (r.id_fase && r.estado !== 'ANULADO') {
        furPorFaseMap.set(r.id_fase, { id: r.id, numero: String(r.numero), estado: String(r.estado) });
      }
    }

    const itemsPorDetalleFase = new Map<string, typeof itemsPresupuesto>();
    for (const it of itemsPresupuesto) {
      if (!it.id_producto) continue;
      const idDetalleFase = catToDetalleFase.get(it.id_detalle_categoria);
      if (idDetalleFase) {
        if (!itemsPorDetalleFase.has(idDetalleFase)) itemsPorDetalleFase.set(idDetalleFase, []);
        itemsPorDetalleFase.get(idDetalleFase)!.push(it);
      }
    }

    const fasesPreview: FaseFurPreviewDto[] = [];

    for (const df of detallesFases) {
      if (!df.IdPresupuestoDetalle) continue;
      const faseMaestra = (df.IdpptoFase ? fasesMap.get(df.IdpptoFase) : null)
        ?? (df.IdpptoFase ? fasesByNameMap.get(df.IdpptoFase.trim().toUpperCase()) : null);
      const idFaseNum = faseMaestra?.id ?? df.id;
      const nombreFase = faseMaestra?.FaseProyecto || df.IdpptoFase || `Fase #${df.id}`;

      const itemsFase = itemsPorDetalleFase.get(df.IdPresupuestoDetalle) || [];
      if (itemsFase.length === 0) continue;

      const productosMap = new Map<number, {
        id_producto: number;
        cantidadTotal: number;
        costoUnitario: number;
      }>();

      for (const it of itemsFase) {
        const cant = Number(it.Cantidad || 0);
        const costo = Number(it.CostoUnitario || 0);
        if (cant <= 0) continue;

        const prev = productosMap.get(it.id_producto);
        if (prev) {
          prev.cantidadTotal += cant;
          prev.costoUnitario = Math.max(prev.costoUnitario, costo);
        } else {
          productosMap.set(it.id_producto, {
            id_producto: it.id_producto,
            cantidadTotal: cant,
            costoUnitario: costo,
          });
        }
      }

      const itemsDto: FurGeneradoItemDto[] = [];
      let totalCantidad = 0;
      let totalEstimado = 0;

      for (const p of productosMap.values()) {
        const prod = prodMap.get(p.id_producto);
        const unidad = prod?.id_unidad_medida ? umMap.get(prod.id_unidad_medida) || 'UND' : 'UND';
        const subtotal = p.cantidadTotal * p.costoUnitario;
        totalCantidad += p.cantidadTotal;
        totalEstimado += subtotal;

        itemsDto.push({
          id_producto: p.id_producto,
          codigo: prod?.codigo ? String(prod.codigo) : `PROD-${p.id_producto}`,
          descripcion: prod?.descripcion ? String(prod.descripcion) : '(Sin descripción)',
          unidad,
          cantidad: p.cantidadTotal.toFixed(2),
          precio_referencial: p.costoUnitario.toFixed(2),
        });
      }

      if (itemsDto.length > 0) {
        fasesPreview.push({
          id_fase: idFaseNum,
          nombre_fase: nombreFase,
          total_productos: itemsDto.length,
          total_cantidad: Number(totalCantidad.toFixed(2)),
          total_estimado: Number(totalEstimado.toFixed(2)),
          fur_existente: furPorFaseMap.get(idFaseNum) ?? null,
          items: itemsDto,
        });
      }
    }

    return {
      id_presupuesto: idPresupuesto,
      proyecto: ppto.Proyecto ? String(ppto.Proyecto) : null,
      id_centro_costo: ppto.id_centro_costo,
      centro_costo: cc ? (cc.centro_costo ? String(cc.centro_costo) : null) : null,
      fases: fasesPreview,
    };
  }

  async generarFursPorFase(
    idOrCode: string | number,
    dto: GenerarFursPresupuestoDto,
    user?: AuthUser,
  ): Promise<GenerarFursPresupuestoResponseDto> {
    const preview = await this.previewFursPorFase(idOrCode);
    if (preview.fases.length === 0) {
      throw new BadRequestException('El presupuesto no tiene fases con ítems de productos para generar requerimientos.');
    }

    let idSolicitante = dto.id_solicitante;
    if (idSolicitante) {
      const anexo = await this.db.orm.public.Anexos.first({ id: idSolicitante });
      if (!anexo) throw new BadRequestException(`El solicitante ID ${idSolicitante} no existe.`);
    } else {
      const trabajador = await this.db.orm.public.Anexos.first({ tipoAnexo: 'Trabajador' });
      if (trabajador) {
        idSolicitante = trabajador.id;
      } else {
        const primerAnexo = await this.db.orm.public.Anexos.first();
        if (!primerAnexo) {
          throw new BadRequestException('No existe ningún Anexo registrado en la base de datos para asignar como solicitante.');
        }
        idSolicitante = primerAnexo.id;
      }
    }

    const todayISO = new Date().toISOString().slice(0, 10);
    const fechaReq = dto.fecha_requerida ? dto.fecha_requerida.slice(0, 10) : null;

    return this.db.transaction(async (tx) => {
      const orm = tx.orm.public;
      const fursGenerados: Array<{
        id: number;
        numero: string;
        id_fase: number;
        nombre_fase: string;
        total_lineas: number;
      }> = [];
      const fasesOmitidas: Array<{
        id_fase: number;
        nombre_fase: string;
        motivo: string;
      }> = [];

      for (const fase of preview.fases) {
        if (fase.fur_existente && !dto.forzar) {
          fasesOmitidas.push({
            id_fase: fase.id_fase,
            nombre_fase: fase.nombre_fase,
            motivo: `Ya cuenta con el requerimiento ${fase.fur_existente.numero} en estado ${fase.fur_existente.estado}`,
          });
          continue;
        }

        const cor = await orm.almacen_correlativo.first({ serie: toVarchar<10>('FUR') });
        let ultimo = 1;
        if (cor) {
          ultimo = (cor.ultimo ?? 0) + 1;
          await orm.almacen_correlativo.where({ serie: toVarchar<10>('FUR') }).update({ ultimo });
        } else {
          await orm.almacen_correlativo.create({
            serie: toVarchar<10>('FUR'),
            ultimo: 1,
          });
        }
        const numeroFur = toVarchar<20>(`FUR-${String(ultimo).padStart(6, '0')}`);

        const reqData: any = {
          numero: numeroFur,
          fecha: todayISO,
          id_centro_costo: preview.id_centro_costo,
          id_fase: fase.id_fase,
          id_solicitante: idSolicitante!,
          justificacion: `[Auto-Ppto: ${preview.id_presupuesto}] Requerimiento de materiales e insumos para la Fase: ${fase.nombre_fase}`,
          estado: 'BORRADOR',
          tipo: 'COMPRA',
        };
        if (fechaReq) reqData.fecha_requerida = fechaReq;

        const nuevoFur = await orm.requerimiento.create(reqData);

        for (const item of fase.items) {
          await orm.requerimiento_detalle.create({
            id_requerimiento: nuevoFur.id,
            id_producto: item.id_producto,
            cantidad: toDecimalString(item.cantidad),
            precio_referencial: toDecimalString(item.precio_referencial),
            observaciones: `Ppto: ${preview.id_presupuesto}`,
          } as any);
        }

        await orm.requerimiento_evento.create({
          id_requerimiento: nuevoFur.id,
          accion: 'CREAR',
          estado_nuevo: 'BORRADOR',
          id_anexo: idSolicitante!,
          comentario: `Generado automáticamente desde presupuesto ${preview.id_presupuesto} por ${user?.usuario ?? 'sistema'}`,
        } as any);

        fursGenerados.push({
          id: nuevoFur.id,
          numero: String(numeroFur),
          id_fase: fase.id_fase,
          nombre_fase: fase.nombre_fase,
          total_lineas: fase.items.length,
        });
      }

      return {
        id_presupuesto: preview.id_presupuesto,
        furs_generados: fursGenerados,
        fases_omitidas: fasesOmitidas,
      };
    });
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
