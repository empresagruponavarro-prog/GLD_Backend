import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Accion, Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import { ParseCatalogoPipe } from './catalogo.pipe.js';
import { ActualizarOpcionDto, CATALOGOS, type Catalogo, CrearOpcionDto, MoverOpcionDto, OpcionResponseDto } from './catalogo.dto.js';
import { CatalogoHandler } from './catalogo.handler.js';

/** RR.HH. › Catálogos de RR.HH.: tipos de trabajador y modalidades de contrato. */
@ApiTags('rrhh/catalogos')
@Controller('rrhh/catalogos')
@Modulo('rrhh.catalogos')
export class CatalogoController {
  constructor(private readonly handler: CatalogoHandler) {}

  @Get(':catalogo')
  @ApiOperation({ summary: 'Opciones del catálogo (activas e inactivas) con cuántos trabajadores las usan' })
  @ApiParam({ name: 'catalogo', enum: CATALOGOS })
  @ApiOkResponse({ type: OpcionResponseDto, isArray: true })
  listar(@Param('catalogo', ParseCatalogoPipe) catalogo: Catalogo): Promise<OpcionResponseDto[]> {
    return this.handler.listar(catalogo);
  }

  @Post(':catalogo')
  @ApiOperation({ summary: 'Agregar una opción (va al final de la lista)' })
  @ApiParam({ name: 'catalogo', enum: CATALOGOS })
  @ApiCreatedResponse({ type: OpcionResponseDto })
  @ApiConflictResponse({ description: 'Ya existe una opción con ese nombre' })
  crear(@Param('catalogo', ParseCatalogoPipe) catalogo: Catalogo, @Body() dto: CrearOpcionDto): Promise<OpcionResponseDto> {
    return this.handler.crear(catalogo, dto);
  }

  @Patch(':catalogo/:id')
  @ApiOperation({ summary: 'Renombrar, activar o desactivar una opción' })
  @ApiParam({ name: 'catalogo', enum: CATALOGOS })
  @ApiOkResponse({ type: OpcionResponseDto })
  @ApiNotFoundResponse({ description: 'No existe' })
  actualizar(
    @Param('catalogo', ParseCatalogoPipe) catalogo: Catalogo,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarOpcionDto,
  ): Promise<OpcionResponseDto> {
    return this.handler.actualizar(catalogo, id, dto);
  }

  @Post(':catalogo/:id/mover')
  @Accion('editar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Subir o bajar una opción en la lista (devuelve la lista reordenada)' })
  @ApiParam({ name: 'catalogo', enum: CATALOGOS })
  @ApiOkResponse({ type: OpcionResponseDto, isArray: true })
  mover(
    @Param('catalogo', ParseCatalogoPipe) catalogo: Catalogo,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MoverOpcionDto,
  ): Promise<OpcionResponseDto[]> {
    return this.handler.mover(catalogo, id, dto.direccion);
  }

  @Delete(':catalogo/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una opción que ningún trabajador usa' })
  @ApiParam({ name: 'catalogo', enum: CATALOGOS })
  @ApiNoContentResponse({ description: 'Eliminada' })
  @ApiConflictResponse({ description: 'En uso: hay que desactivarla' })
  eliminar(@Param('catalogo', ParseCatalogoPipe) catalogo: Catalogo, @Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.handler.eliminar(catalogo, id);
  }
}
