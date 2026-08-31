import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { CategoriaController } from './categoria/categoria.controller.js';
import { CategoriaHandler } from './categoria/categoria.handler.js';
import { CategoriaProductosController } from './categoria/productos/productos.controller.js';
import { CategoriaProductosHandler } from './categoria/productos/productos.handler.js';
import { ProductoController } from './producto/producto.controller.js';
import { ProductoHandler } from './producto/producto.handler.js';
import { TipoCategoriaController } from './tipo-categoria/tipo-categoria.controller.js';
import { TipoCategoriaHandler } from './tipo-categoria/tipo-categoria.handler.js';
import { EquivalenciaController } from './unidad-medida/equivalencia/equivalencia.controller.js';
import { EquivalenciaHandler } from './unidad-medida/equivalencia/equivalencia.handler.js';
import { UnidadMedidaController } from './unidad-medida/unidad-medida.controller.js';
import { UnidadMedidaHandler } from './unidad-medida/unidad-medida.handler.js';
import { UnidadMedidaProductosController } from './unidad-medida/productos/productos.controller.js';
import { UnidadMedidaProductosHandler } from './unidad-medida/productos/productos.handler.js';

@Module({
  imports: [PrismaModule],
  controllers: [
    TipoCategoriaController,
    CategoriaController,
    UnidadMedidaController,
    EquivalenciaController,
    ProductoController,
    CategoriaProductosController,
    UnidadMedidaProductosController,
  ],
  providers: [
    TipoCategoriaHandler,
    CategoriaHandler,
    UnidadMedidaHandler,
    EquivalenciaHandler,
    ProductoHandler,
    CategoriaProductosHandler,
    UnidadMedidaProductosHandler,
  ],
})
export class MaestrosModule {}