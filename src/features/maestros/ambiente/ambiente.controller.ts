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
import { AmbienteResponseDto, CreateAmbienteDto, UpdateAmbienteDto } from './ambiente.dto.js';
import { AmbienteHandler } from './ambiente.handler.js';

@ApiTags('maestros/ambiente')
@Controller('maestros/ambiente')
@Modulo('maestros.generales')
export class AmbienteController {
  constructor(private readonly handler: AmbienteHandler) {}

  @LecturaCompartida()
  @Get()
  @ApiOperation({ summary: 'Listar ambientes u oficinas' })
  @ApiQuery({ name: 'activos', required: false, type: Boolean })
  @ApiOkResponse({ type: AmbienteResponseDto, isArray: true })
  list(@Query('activos') activos?: string): Promise<AmbienteResponseDto[]> {
    return this.handler.list(activos === 'true');
  }

  @LecturaCompartida()
  @Get(':id')
  @ApiOperation({ summary: 'Obtener ambiente por ID' })
  @ApiOkResponse({ type: AmbienteResponseDto })
  @ApiNotFoundResponse({ description: 'No existe el ambiente' })
  getById(@Param('id', ParseIntPipe) id: number): Promise<AmbienteResponseDto> {
    return this.handler.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear nuevo ambiente' })
  @ApiCreatedResponse({ type: AmbienteResponseDto })
  @ApiConflictResponse({ description: 'Código de ambiente duplicado' })
  create(@Body() dto: CreateAmbienteDto): Promise<AmbienteResponseDto> {
    return this.handler.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar descripción o estado de un ambiente' })
  @ApiOkResponse({ type: AmbienteResponseDto })
  @ApiNotFoundResponse({ description: 'No existe el ambiente' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAmbienteDto,
  ): Promise<AmbienteResponseDto> {
    return this.handler.update(id, dto);
  }

  @Patch(':id/estado')
  @ApiOperation({ summary: 'Activar o desactivar ambiente' })
  @ApiOkResponse({ type: AmbienteResponseDto })
  @ApiNotFoundResponse({ description: 'No existe el ambiente' })
  toggleEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body('estado') estado: boolean,
  ): Promise<AmbienteResponseDto> {
    return this.handler.toggleEstado(id, Boolean(estado));
  }
}
