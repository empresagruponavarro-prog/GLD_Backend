import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  throwIfForeignKeyViolation,
  throwIfUniqueViolation,
} from '../../../platform/db/pg-errors.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { CreateProductoDto, type ProductoRow, UpdateProductoDto } from './producto.dto.js';

@Injectable()
export class ProductoHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(): Promise<ProductoRow[]> {
    return await this.db.orm.public.producto.orderBy((p) => p.id.asc()).all();
  }

  async getById(id: number): Promise<ProductoRow> {
    const row = await this.db.orm.public.producto.first({ id });
    if (!row) throw new NotFoundException(`Producto ${id} no encontrado`);
    return row;
  }

  async create(dto: CreateProductoDto): Promise<ProductoRow> {
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
      });
    } catch (error) {
      throwIfUniqueViolation(error, `El código "${dto.codigo}" ya existe`);
      throw error;
    }
  }

  async update(id: number, dto: UpdateProductoDto): Promise<ProductoRow> {
    if (dto.id_categoria !== undefined) {
      await this.assertCategoriaExists(dto.id_categoria);
    }
    if (dto.id_unidad_medida !== undefined) {
      await this.assertUnidadMedidaExists(dto.id_unidad_medida);
    }

    const data: Partial<ProductoRow> = {};
    if (dto.codigo !== undefined) data.codigo = dto.codigo;
    if (dto.descripcion !== undefined) data.descripcion = dto.descripcion;
    if (dto.id_categoria !== undefined) data.id_categoria = dto.id_categoria;
    if (dto.id_unidad_medida !== undefined) data.id_unidad_medida = dto.id_unidad_medida;
    if (dto.tipo_producto !== undefined) data.tipo_producto = dto.tipo_producto;
    if (dto.stock !== undefined) data.stock = dto.stock;
    if (dto.comentarios !== undefined) data.comentarios = dto.comentarios;
    if (dto.imagen_url !== undefined) data.imagen_url = dto.imagen_url;

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
    try {
      const row = await this.db.orm.public.producto.where({ id }).delete();
      if (!row) throw new NotFoundException(`Producto ${id} no encontrado`);
    } catch (error) {
      throwIfForeignKeyViolation(error, 'No se puede eliminar: tiene dependencias asociadas');
      throw error;
    }
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