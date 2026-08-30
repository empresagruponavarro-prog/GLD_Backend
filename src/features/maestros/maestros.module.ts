import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { CategoriaController } from './categoria/categoria.controller.js';
import { CategoriaHandler } from './categoria/categoria.handler.js';
import { TipoCategoriaController } from './tipo-categoria/tipo-categoria.controller.js';
import { TipoCategoriaHandler } from './tipo-categoria/tipo-categoria.handler.js';
import { EquivalenciaController } from './unidad-medida/equivalencia/equivalencia.controller.js';
import { EquivalenciaHandler } from './unidad-medida/equivalencia/equivalencia.handler.js';
import { UnidadMedidaController } from './unidad-medida/unidad-medida.controller.js';
import { UnidadMedidaHandler } from './unidad-medida/unidad-medida.handler.js';
import { ProductoController } from './producto/producto.controller.js';
import { ProductoHandler } from './producto/producto.handler.js';

@Module({
  imports: [PrismaModule],
  controllers: [
    TipoCategoriaController,
    CategoriaController,
    UnidadMedidaController,
    EquivalenciaController,
    ProductoController,
  ],
  providers: [
    TipoCategoriaHandler,
    CategoriaHandler,
    UnidadMedidaHandler,
    EquivalenciaHandler,
    ProductoHandler,
  ],
})
export class MaestrosModule {}