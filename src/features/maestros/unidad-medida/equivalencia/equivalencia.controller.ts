import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Paginated } from '../../../../platform/db/pagination.js';
import { EquivalenciaHandler } from './equivalencia.handler.js';
import {
  CreateEquivalenciaDto,
  ListEquivalenciaQueryDto,
  type EquivalenciaRow,
  UpdateEquivalenciaDto,
} from './equivalencia.dto.js';

@ApiTags('maestros/unidad-medida')
@Controller('maestros/unidad-medida/:id/equivalencias')
export class EquivalenciaController {
  constructor(private readonly handler: EquivalenciaHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar equivalencias de una unidad de medida' })
  list(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ListEquivalenciaQueryDto,
  ): Promise<Paginated<EquivalenciaRow>> {
    return this.handler.list(id, query);
  }

  @Get(':equivalenciaId')
  @ApiOperation({ summary: 'Obtener una equivalencia por id' })
  getById(
    @Param('id', ParseIntPipe) id: number,
    @Param('equivalenciaId', ParseIntPipe) equivalenciaId: number,
  ): Promise<EquivalenciaRow> {
    return this.handler.getById(id, equivalenciaId);
  }

  @Post()
  @ApiOperation({ summary: 'Crear una equivalencia' })
  create(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateEquivalenciaDto,
  ): Promise<EquivalenciaRow> {
    return this.handler.create(id, dto);
  }

  @Patch(':equivalenciaId')
  @ApiOperation({ summary: 'Actualizar una equivalencia' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Param('equivalenciaId', ParseIntPipe) equivalenciaId: number,
    @Body() dto: UpdateEquivalenciaDto,
  ): Promise<EquivalenciaRow> {
    return this.handler.update(id, equivalenciaId, dto);
  }

  @Delete(':equivalenciaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una equivalencia' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Param('equivalenciaId', ParseIntPipe) equivalenciaId: number,
  ): Promise<void> {
    return this.handler.remove(id, equivalenciaId);
  }
}