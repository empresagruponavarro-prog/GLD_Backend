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
import { type Paginated } from '../../../platform/db/pagination.js';
import { UnidadMedidaHandler } from './unidad-medida.handler.js';
import {
  CreateUnidadMedidaDto,
  ListUnidadMedidaQueryDto,
  type UnidadMedidaRow,
  UpdateUnidadMedidaDto,
} from './unidad-medida.dto.js';

@ApiTags('maestros/unidad-medida')
@Controller('maestros/unidad-medida')
export class UnidadMedidaController {
  constructor(private readonly handler: UnidadMedidaHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar unidades de medida' })
  list(@Query() query: ListUnidadMedidaQueryDto): Promise<Paginated<UnidadMedidaRow>> {
    return this.handler.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una unidad de medida por id' })
  getById(@Param('id', ParseIntPipe) id: number): Promise<UnidadMedidaRow> {
    return this.handler.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear una unidad de medida' })
  create(@Body() dto: CreateUnidadMedidaDto): Promise<UnidadMedidaRow> {
    return this.handler.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una unidad de medida' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUnidadMedidaDto,
  ): Promise<UnidadMedidaRow> {
    return this.handler.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una unidad de medida' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.handler.remove(id);
  }
}