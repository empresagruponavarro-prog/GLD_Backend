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
import { CreateLocalDto, LocalResponseDto, UpdateLocalDto } from './local.dto.js';
import { LocalHandler } from './local.handler.js';

@ApiTags('maestros/local')
@Controller('maestros/local')
@Modulo('maestros.generales')
export class LocalController {
  constructor(private readonly handler: LocalHandler) {}

  @LecturaCompartida()
  @Get()
  @ApiOperation({ summary: 'Listar locales físicos y sedes' })
  @ApiQuery({ name: 'activos', required: false, type: Boolean })
  @ApiOkResponse({ type: LocalResponseDto, isArray: true })
  list(@Query('activos') activos?: string): Promise<LocalResponseDto[]> {
    return this.handler.list(activos === 'true');
  }

  @LecturaCompartida()
  @Get(':id')
  @ApiOperation({ summary: 'Obtener un local por ID' })
  @ApiOkResponse({ type: LocalResponseDto })
  @ApiNotFoundResponse({ description: 'No existe el local' })
  getById(@Param('id', ParseIntPipe) id: number): Promise<LocalResponseDto> {
    return this.handler.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear local físico asignado a Empresa O a Centro de Costo' })
  @ApiCreatedResponse({ type: LocalResponseDto })
  @ApiConflictResponse({ description: 'Código duplicado' })
  create(@Body() dto: CreateLocalDto): Promise<LocalResponseDto> {
    return this.handler.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar datos de un local' })
  @ApiOkResponse({ type: LocalResponseDto })
  @ApiNotFoundResponse({ description: 'No existe el local' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLocalDto,
  ): Promise<LocalResponseDto> {
    return this.handler.update(id, dto);
  }

  @Patch(':id/estado')
  @ApiOperation({ summary: 'Activar o desactivar local' })
  @ApiOkResponse({ type: LocalResponseDto })
  @ApiNotFoundResponse({ description: 'No existe el local' })
  toggleEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body('estado') estado: boolean,
  ): Promise<LocalResponseDto> {
    return this.handler.toggleEstado(id, Boolean(estado));
  }
}
