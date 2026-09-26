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
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { type Paginated } from '../../../platform/db/pagination.js';
import {
  CreateEspecialidadDto,
  EspecialidadResponseDto,
  EspecialidadSelectQueryDto,
  EspecialidadSelectResponseDto,
  ListEspecialidadQueryDto,
  UpdateEspecialidadDto,
} from './especialidad.dto.js';
import { EspecialidadHandler } from './especialidad.handler.js';

@ApiTags('maestros/especialidad')
@Controller('maestros/especialidad')
export class EspecialidadController {
  constructor(private readonly handler: EspecialidadHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar especialidades' })
  @ApiOkResponse({
    description: 'Lista paginada de especialidades',
  })
  list(@Query() query: ListEspecialidadQueryDto): Promise<Paginated<EspecialidadResponseDto>> {
    return this.handler.list(query);
  }

  @Get('select')
  @ApiOperation({ summary: 'Listar especialidades para selector (id y nombre), filtrable por tipoAnexo' })
  @ApiOkResponse({
    type: EspecialidadSelectResponseDto,
    isArray: true,
    description: 'Listado mínimo (id y nombre) de especialidades',
  })
  select(@Query() query: EspecialidadSelectQueryDto): Promise<EspecialidadSelectResponseDto[]> {
    return this.handler.select(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una especialidad por id' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la especialidad' })
  @ApiOkResponse({ type: EspecialidadResponseDto })
  @ApiNotFoundResponse({ description: 'Especialidad no encontrada' })
  getById(@Param('id', ParseIntPipe) id: number): Promise<EspecialidadResponseDto> {
    return this.handler.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear una especialidad' })
  @ApiCreatedResponse({ type: EspecialidadResponseDto })
  create(@Body() dto: CreateEspecialidadDto): Promise<EspecialidadResponseDto> {
    return this.handler.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una especialidad' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la especialidad' })
  @ApiOkResponse({ type: EspecialidadResponseDto })
  @ApiNotFoundResponse({ description: 'Especialidad no encontrada' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEspecialidadDto,
  ): Promise<EspecialidadResponseDto> {
    return this.handler.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una especialidad' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la especialidad' })
  @ApiNoContentResponse({ description: 'Especialidad eliminada' })
  @ApiNotFoundResponse({ description: 'Especialidad no encontrada' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.handler.remove(id);
  }
}