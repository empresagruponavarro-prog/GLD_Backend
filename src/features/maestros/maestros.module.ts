import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AlmacenModule } from '../almacen/almacen.module.js';
import { CategoriaController } from './categoria/categoria.controller.js';
import { CategoriaHandler } from './categoria/categoria.handler.js';
import { CategoriaProductosController } from './categoria/productos/productos.controller.js';
import { CategoriaProductosHandler } from './categoria/productos/productos.handler.js';
import { AnexoController } from './anexo/anexo.controller.js';
import { AnexoHandler } from './anexo/anexo.handler.js';
import { ActivoFijoController } from './activo-fijo/activo-fijo.controller.js';
import { ActivoFijoHandler } from './activo-fijo/activo-fijo.handler.js';
import { AreaController } from './area/area.controller.js';
import { AreaHandler } from './area/area.handler.js';
import { FamiliaAlmacenController } from './familia-almacen/familia-almacen.controller.js';
import { FamiliaAlmacenHandler } from './familia-almacen/familia-almacen.handler.js';
import { EspecialidadController } from './especialidad/especialidad.controller.js';
import { EspecialidadHandler } from './especialidad/especialidad.handler.js';
import { ProductoCaracteristicaController } from './producto-caracteristica/producto-caracteristica.controller.js';
import { ProductoCaracteristicaHandler } from './producto-caracteristica/producto-caracteristica.handler.js';
import { ProductoController } from './producto/producto.controller.js';
import { ProductoHandler } from './producto/producto.handler.js';
import { TipoDocIdentidadController } from './tipo-doc-identidad/tipo-doc-identidad.controller.js';
import { TipoDocIdentidadHandler } from './tipo-doc-identidad/tipo-doc-identidad.handler.js';
import { TipoCategoriaController } from './tipo-categoria/tipo-categoria.controller.js';
import { TipoCategoriaHandler } from './tipo-categoria/tipo-categoria.handler.js';
import { EquivalenciaController } from './unidad-medida/equivalencia/equivalencia.controller.js';
import { EquivalenciaHandler } from './unidad-medida/equivalencia/equivalencia.handler.js';
import { UnidadMedidaController } from './unidad-medida/unidad-medida.controller.js';
import { UnidadMedidaHandler } from './unidad-medida/unidad-medida.handler.js';
import { UnidadMedidaProductosController } from './unidad-medida/productos/productos.controller.js';
import { UnidadMedidaProductosHandler } from './unidad-medida/productos/productos.handler.js';
import { LocalController } from './local/local.controller.js';
import { LocalHandler } from './local/local.handler.js';
import { NivelController } from './nivel/nivel.controller.js';
import { NivelHandler } from './nivel/nivel.handler.js';
import { AmbienteController } from './ambiente/ambiente.controller.js';
import { AmbienteHandler } from './ambiente/ambiente.handler.js';

import { UbicacionController } from './ubicacion/ubicacion.controller.js';
import { UbicacionHandler } from './ubicacion/ubicacion.handler.js';

@Module({
  imports: [PrismaModule, AlmacenModule],
  controllers: [
    TipoCategoriaController,
    CategoriaController,
    UnidadMedidaController,
    EquivalenciaController,
    ProductoController,
    ProductoCaracteristicaController,
    CategoriaProductosController,
    UnidadMedidaProductosController,
    EspecialidadController,
    TipoDocIdentidadController,
    AnexoController,
    ActivoFijoController,
    FamiliaAlmacenController,
    AreaController,
    LocalController,
    NivelController,
    AmbienteController,
    UbicacionController,
  ],
  providers: [
    AreaHandler,
    FamiliaAlmacenHandler,
    TipoCategoriaHandler,
    CategoriaHandler,
    UnidadMedidaHandler,
    EquivalenciaHandler,
    ProductoHandler,
    ProductoCaracteristicaHandler,
    CategoriaProductosHandler,
    UnidadMedidaProductosHandler,
    EspecialidadHandler,
    TipoDocIdentidadHandler,
    AnexoHandler,
    ActivoFijoHandler,
    LocalHandler,
    NivelHandler,
    AmbienteHandler,
    UbicacionHandler,
  ],
})
export class MaestrosModule {}