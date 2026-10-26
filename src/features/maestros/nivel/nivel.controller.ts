import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { LecturaCompartida, Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import { CreateNivelDto, NivelResponseDto, UpdateNivelDto } from './nivel.dto.js';
import { NivelHandler } from './nivel.handler.js';

@ApiTags('maestros/nivel')
@Controller('maestros/nivel')
@Modulo('maestros.generales')
export class NivelController {
  constructor(private readonly handler: NivelHandler) {}

  @LecturaCompartida()
  @Get()
  @ApiOperation({ summary: 'Listar niveles o pisos' })
  @ApiQuery({ name: 'activos', required: false, type: Boolean })
  @ApiOkResponse({ type: NivelResponseDto, isArray: true })
  list(@Query('activos') activos?: string): Promise<NivelResponseDto[]> {
    return this.handler.list(activos === 'true');
  }

  @LecturaCompartida()
  @Get(':id')
  @ApiOperation({ summary: 'Obtener nivel por ID' })
  @ApiOkResponse({ type: NivelResponseDto })
  @ApiNotFoundResponse({ description: 'No existe el nivel' })
  getById(@Param('id', ParseIntPipe) id: number): Promise<NivelResponseDto> {
    return this.handler.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear nuevo nivel' })
  @ApiCreatedResponse({ type: NivelResponseDto })
  @ApiConflictResponse({ description: 'Código de nivel duplicado' })
  create(@Body() dto: CreateNivelDto): Promise<NivelResponseDto> {
    return this.handler.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar descripción o estado de un nivel' })
  @ApiOkResponse({ type: NivelResponseDto })
  @ApiNotFoundResponse({ description: 'No existe el nivel' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNivelDto,
  ): Promise<NivelResponseDto> {
    return this.handler.update(id, dto);
  }

  @Patch(':id/estado')
  @ApiOperation({ summary: 'Activar o desactivar nivel' })
  @ApiOkResponse({ type: NivelResponseDto })
  @ApiNotFoundResponse({ description: 'No existe el nivel' })
  toggleEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body('estado') estado: boolean,
  ): Promise<NivelResponseDto> {
    return this.handler.toggleEstado(id, Boolean(estado));
  }
}
