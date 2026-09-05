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
import {
  CreateProductoDto,
  ListProductoQueryDto,
  ProductoResponseDto,
  UpdateProductoDto,
} from './producto.dto.js';

@Injectable()
export class ProductoHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

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

  async getById(id: number): Promise<ProductoResponseDto> {
    const row = await this.db.orm.public.producto.first({ id });
    if (!row) throw new NotFoundException(`Producto ${id} no encontrado`);
    return row;
  }

  async create(dto: CreateProductoDto): Promise<ProductoResponseDto> {
    await this.assertCategoriaExists(dto.id_categoria);
    await this.assertUnidadMedidaExists(dto.id_unidad_medida);
    try {
      return await this.db.orm.public.producto.create({
        codigo: dto.codigo,
        descripcion: dto.descripcion,
        id_categoria: dto.id_categoria,
        id_unidad_medida: dto.id_unidad_medida,
        tipo_producto: dto.tipo_producto,
        stock: dto.stock,
        comentarios: dto.comentarios,
        imagen_url: dto.imagen_url,
        estado: dto.estado,
      });
    } catch (error) {
      throwIfUniqueViolation(error, `El código "${dto.codigo}" ya existe`);
      throw error;
    }
  }

  async update(id: number, dto: UpdateProductoDto): Promise<ProductoResponseDto> {
    if (dto.id_categoria !== undefined) {
      await this.assertCategoriaExists(dto.id_categoria);
    }
    if (dto.id_unidad_medida !== undefined) {
      await this.assertUnidadMedidaExists(dto.id_unidad_medida);
    }

    const data: Partial<ProductoResponseDto> = {};
    if (dto.codigo !== undefined) data.codigo = dto.codigo;
    if (dto.descripcion !== undefined) data.descripcion = dto.descripcion;
    if (dto.id_categoria !== undefined) data.id_categoria = dto.id_categoria;
    if (dto.id_unidad_medida !== undefined) data.id_unidad_medida = dto.id_unidad_medida;
    if (dto.tipo_producto !== undefined) data.tipo_producto = dto.tipo_producto;
    if (dto.stock !== undefined) data.stock = dto.stock;
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
          ),
        )
      : base;
    const [total, data] = await Promise.all([
      collection.aggregate((agg) => ({ total: agg.count() })),
      collection.limit(pageSize).offset(offset).all(),
    ]);
    return toPaginated(data, total.total, page, pageSize);
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
    query.estado !== undefined
  );
}