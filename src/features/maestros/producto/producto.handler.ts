import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and } from '@prisma/orm-postgres/orm-client';
import { pageParams, toPaginated, type Paginated } from '../../../platform/db/pagination.js';
import { throwIfUniqueViolation } from '../../../platform/db/pg-errors.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { AlmacenSql, I, T, sqlTag } from '../../almacen/shared/almacen-sql.js';
import {
  AlternativaResponseDto,
  CreateProductoDto,
  ReplaceAlternativasDto,
  ListProductoQueryDto,
  ProductoResponseDto,
  ProductoSelectQueryDto,
  ProductoSelectResponseDto,
  UpdateProductoDto,
} from './producto.dto.js';

@Injectable()
export class ProductoHandler {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sql: AlmacenSql,
  ) {}

  async list(query: ListProductoQueryDto): Promise<Paginated<ProductoResponseDto>> {
    return this.listWithFilters(undefined, query);
  }

  async listByCategoria(
    categoriaId: number,
    query: ListProductoQueryDto,
  ): Promise<Paginated<ProductoResponseDto>> {
    return this.listWithFilters({ id_categoria: categoriaId }, query);
  }

  async listByUnidadMedida(
    unidadMedidaId: number,
    query: ListProductoQueryDto,
  ): Promise<Paginated<ProductoResponseDto>> {
    return this.listWithFilters({ id_unidad_medida: unidadMedidaId }, query);
  }

  async select(query: ProductoSelectQueryDto): Promise<ProductoSelectResponseDto[]> {
    const base = this.db.orm.public.producto.orderBy((p) => p.descripcion.asc());
    const collection = query.tipo_producto
      ? base.where((p) => p.tipo_producto.eq(query.tipo_producto!))
      : base;
    const rows = await collection.all();
    return rows.map((row) => ({ id: row.id, descripcion: row.descripcion }));
  }

  async getById(id: number): Promise<ProductoResponseDto> {
    const row = await this.db.orm.public.producto.first({ id });
    if (!row) throw new NotFoundException(`Producto ${id} no encontrado`);
    return row;
  }

  async create(dto: CreateProductoDto): Promise<ProductoResponseDto> {
    await this.assertCategoriaExists(dto.id_categoria);
    await this.assertUnidadMedidaExists(dto.id_unidad_medida);
    if (dto.id_almacen_default !== undefined) await this.assertAlmacenExists(dto.id_almacen_default);

    if (dto.id_familia === undefined) {
      if (!dto.codigo) throw new BadRequestException('codigo es obligatorio cuando no se indica id_familia');
      try {
        return await this.db.orm.public.producto.create(this.toCreateData(dto, dto.codigo));
      } catch (error) {
        throwIfUniqueViolation(error, `El código "${dto.codigo}" ya existe`);
        throw error;
      }
    }

    if (dto.codigo) {
      throw new BadRequestException('El código se genera automáticamente cuando se indica id_familia');
    }
    // Correlativo atomico por familia: el UPDATE bloquea la fila hasta el commit.
    return this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      const [familia] = await q.rows<{ prefijo: string; n: number }>({ prefijo: T, n: I }, tx)`
        UPDATE familia_almacen SET ultimo_correlativo = ultimo_correlativo + 1
         WHERE id = ${dto.id_familia as number}::int AND estado = true
        RETURNING prefijo::text AS prefijo, ultimo_correlativo AS n`;
      if (!familia) throw new BadRequestException(`Familia ${dto.id_familia} no existe o está inactiva`);
      const codigo = `${familia.prefijo}-${String(familia.n).padStart(4, '0')}`;
      return tx.orm.public.producto.create(this.toCreateData(dto, codigo));
    });
  }

  async update(id: number, dto: UpdateProductoDto): Promise<ProductoResponseDto> {
    if (dto.id_categoria !== undefined) {
      await this.assertCategoriaExists(dto.id_categoria);
    }
    if (dto.id_unidad_medida !== undefined) {
      await this.assertUnidadMedidaExists(dto.id_unidad_medida);
    }

    if (dto.id_almacen_default !== undefined) await this.assertAlmacenExists(dto.id_almacen_default);
    if (dto.id_familia !== undefined || dto.codigo !== undefined) {
      const actual = await this.getById(id);
      if (dto.id_familia !== undefined && dto.id_familia !== actual.id_familia) {
        throw new BadRequestException('La familia no se puede cambiar después de crear el producto');
      }
      if (actual.id_familia !== null && dto.codigo !== undefined && dto.codigo !== actual.codigo) {
        throw new BadRequestException('El código es automático y no se puede editar en productos con familia');
      }
    }

    const data: Partial<ProductoResponseDto> = {};
    if (dto.codigo !== undefined) data.codigo = dto.codigo;
    if (dto.descripcion !== undefined) data.descripcion = dto.descripcion;
    if (dto.id_categoria !== undefined) data.id_categoria = dto.id_categoria;
    if (dto.id_unidad_medida !== undefined) data.id_unidad_medida = dto.id_unidad_medida;
    if (dto.tipo_producto !== undefined) data.tipo_producto = dto.tipo_producto;
    if (dto.clase_inventario !== undefined) data.clase_inventario = dto.clase_inventario;
    if (dto.uso_principal !== undefined) data.uso_principal = dto.uso_principal;
    if (dto.stock_minimo !== undefined) data.stock_minimo = dto.stock_minimo;
    if (dto.stock_objetivo !== undefined) data.stock_objetivo = dto.stock_objetivo;
    if (dto.estado_operativo !== undefined) data.estado_operativo = dto.estado_operativo;
    if (dto.id_almacen_default !== undefined) data.id_almacen_default = dto.id_almacen_default;
    if (dto.comentarios !== undefined) data.comentarios = dto.comentarios;
    if (dto.imagen_url !== undefined) data.imagen_url = dto.imagen_url;
    if (dto.estado !== undefined) data.estado = dto.estado;

    try {
      const row = await this.db.orm.public.producto.where({ id }).update(data);
      if (!row) throw new NotFoundException(`Producto ${id} no encontrado`);
      return row;
    } catch (error) {
      throwIfUniqueViolation(error, `El código "${dto.codigo ?? ''}" ya existe`);
      throw error;
    }
  }

  async remove(id: number): Promise<void> {
    const row = await this.db.orm.public.producto.where({ id }).update({ estado: false });
    if (!row) throw new NotFoundException(`Producto ${id} no encontrado`);
  }

  private async listWithFilters(
    forced: Partial<ProductoResponseDto> | undefined,
    query: ListProductoQueryDto,
  ): Promise<Paginated<ProductoResponseDto>> {
    const { page, pageSize, offset } = pageParams(query);
    const filtered = hasFilters(query) || forced !== undefined;
    const base = this.db.orm.public.producto.orderBy((p) => p.id.asc());
    const collection = filtered
      ? base.where((p) =>
          and(
            ...(forced?.id_categoria !== undefined
              ? [p.id_categoria.eq(forced.id_categoria)]
              : []),
            ...(forced?.id_unidad_medida !== undefined
              ? [p.id_unidad_medida.eq(forced.id_unidad_medida)]
              : []),
            ...(query.codigo ? [p.codigo.ilike(`%${query.codigo}%`)] : []),
            ...(query.descripcion ? [p.descripcion.ilike(`%${query.descripcion}%`)] : []),
            ...(query.id_categoria !== undefined ? [p.id_categoria.eq(query.id_categoria)] : []),
            ...(query.id_unidad_medida !== undefined
              ? [p.id_unidad_medida.eq(query.id_unidad_medida)]
              : []),
            ...(query.tipo_producto !== undefined
              ? [p.tipo_producto.eq(query.tipo_producto)]
              : []),
            ...(query.estado !== undefined ? [p.estado.eq(query.estado)] : []),
            ...(query.id_familia !== undefined ? [p.id_familia.eq(query.id_familia)] : []),
            ...(query.clase_inventario !== undefined ? [p.clase_inventario.eq(query.clase_inventario)] : []),
          ),
        )
      : base;
    const [total, data] = await Promise.all([
      collection.aggregate((agg) => ({ total: agg.count() })),
      collection.limit(pageSize).offset(offset).all(),
    ]);
    return toPaginated(data, total.total, page, pageSize);
  }

  async getAlternativas(id: number): Promise<AlternativaResponseDto[]> {
    await this.getById(id);
    const q = sqlTag(this.sql);
    return q.rows<AlternativaResponseDto>({
      id_producto_alternativo: I,
      prioridad: I,
      codigo: T,
      descripcion: T,
    })`SELECT a.id_producto_alternativo, a.prioridad, p.codigo::text AS codigo, p.descripcion::text AS descripcion
         FROM producto_alternativa a JOIN producto p ON p.id = a.id_producto_alternativo
        WHERE a.id_producto = ${id}::int ORDER BY a.prioridad`;
  }

  async replaceAlternativas(id: number, dto: ReplaceAlternativasDto): Promise<AlternativaResponseDto[]> {
    await this.getById(id);
    const ids = dto.alternativas.map((a) => a.id_producto_alternativo);
    const prioridades = dto.alternativas.map((a) => a.prioridad);
    if (ids.includes(id)) throw new BadRequestException('Un producto no puede ser alternativa de sí mismo');
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Hay alternativas repetidas');
    if (new Set(prioridades).size !== prioridades.length) throw new BadRequestException('Hay prioridades repetidas');
    for (const alt of ids) {
      const row = await this.db.orm.public.producto.first({ id: alt });
      if (!row) throw new BadRequestException(`El producto alternativo ${alt} no existe`);
    }
    await this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      await q.run(tx)`DELETE FROM producto_alternativa WHERE id_producto = ${id}::int`;
      for (const alt of dto.alternativas) {
        await q.run(tx)`
          INSERT INTO producto_alternativa (id_producto, id_producto_alternativo, prioridad)
          VALUES (${id}::int, ${alt.id_producto_alternativo}::int, ${alt.prioridad}::int)`;
      }
    });
    return this.getAlternativas(id);
  }

  private toCreateData(dto: CreateProductoDto, codigo: string) {
    return {
      codigo,
      descripcion: dto.descripcion,
      id_categoria: dto.id_categoria,
      id_unidad_medida: dto.id_unidad_medida,
      tipo_producto: dto.tipo_producto,
      comentarios: dto.comentarios,
      imagen_url: dto.imagen_url,
      estado: dto.estado,
      id_familia: dto.id_familia,
      clase_inventario: dto.clase_inventario,
      uso_principal: dto.uso_principal,
      stock_minimo: dto.stock_minimo,
      stock_objetivo: dto.stock_objetivo,
      estado_operativo: dto.estado_operativo,
      id_almacen_default: dto.id_almacen_default,
    };
  }

  private async assertAlmacenExists(id: number): Promise<void> {
    const q = sqlTag(this.sql);
    const [row] = await q.rows<{ id: number }>({ id: I })`SELECT id FROM almacen WHERE id = ${id}::int`;
    if (!row) throw new BadRequestException(`Almacén ${id} no existe`);
  }

  private async assertCategoriaExists(id: number): Promise<void> {
    const categoria = await this.db.orm.public.categoria.first({ id });
    if (!categoria) throw new BadRequestException(`Categoría ${id} no existe`);
  }

  private async assertUnidadMedidaExists(id: number): Promise<void> {
    const unidad = await this.db.orm.public.unidad_medida.first({ id });
    if (!unidad) throw new BadRequestException(`Unidad de medida ${id} no existe`);
  }
}

function hasFilters(query: ListProductoQueryDto): boolean {
  return (
    query.codigo !== undefined ||
    query.descripcion !== undefined ||
    query.id_categoria !== undefined ||
    query.id_unidad_medida !== undefined ||
    query.tipo_producto !== undefined ||
    query.estado !== undefined ||
    query.id_familia !== undefined ||
    query.clase_inventario !== undefined
  );
}