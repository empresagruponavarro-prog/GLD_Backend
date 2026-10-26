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
import {
  CreateUbicacionDto,
  ResolverUbicacionQueryDto,
  UbicacionResponseDto,
  UpdateUbicacionDto,
} from './ubicacion.dto.js';
import { UbicacionHandler } from './ubicacion.handler.js';

@ApiTags('maestros/ubicacion')
@Controller('maestros/ubicacion')
@Modulo('maestros.generales')
export class UbicacionController {
  constructor(private readonly handler: UbicacionHandler) {}

  @LecturaCompartida()
  @Get()
  @ApiOperation({ summary: 'Listar ubicaciones con detalles de local, nivel, ambiente y área' })
  @ApiQuery({ name: 'activos', required: false, type: Boolean })
  @ApiOkResponse({ type: UbicacionResponseDto, isArray: true })
  list(@Query('activos') activos?: string): Promise<UbicacionResponseDto[]> {
    return this.handler.list(activos === 'true');
  }

  @LecturaCompartida()
  @Get('resolver')
  @ApiOperation({ summary: 'Consultar la ubicación de la tupla (local, nivel, ambiente); null si aún no existe' })
  @ApiOkResponse({ type: UbicacionResponseDto, description: 'Ubicación encontrada, o cuerpo vacío si no existe' })
  resolver(@Query() query: ResolverUbicacionQueryDto): Promise<UbicacionResponseDto | null> {
    return this.handler.resolver(query);
  }

  @LecturaCompartida()
  @Get(':id')
  @ApiOperation({ summary: 'Obtener ubicación por ID' })
  @ApiOkResponse({ type: UbicacionResponseDto })
  @ApiNotFoundResponse({ description: 'No existe la ubicación' })
  getById(@Param('id', ParseIntPipe) id: number): Promise<UbicacionResponseDto> {
    return this.handler.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear nueva ubicación' })
  @ApiCreatedResponse({ type: UbicacionResponseDto })
  @ApiConflictResponse({ description: 'Código o tupla (local, nivel, ambiente) duplicada' })
  create(@Body() dto: CreateUbicacionDto): Promise<UbicacionResponseDto> {
    return this.handler.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar datos de una ubicación' })
  @ApiOkResponse({ type: UbicacionResponseDto })
  @ApiNotFoundResponse({ description: 'No existe la ubicación' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUbicacionDto,
  ): Promise<UbicacionResponseDto> {
    return this.handler.update(id, dto);
  }

  @Patch(':id/estado')
  @ApiOperation({ summary: 'Activar o desactivar ubicación' })
  @ApiOkResponse({ type: UbicacionResponseDto })
  @ApiNotFoundResponse({ description: 'No existe la ubicación' })
  toggleEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body('estado') estado: boolean,
  ): Promise<UbicacionResponseDto> {
    return this.handler.toggleEstado(id, Boolean(estado));
  }
}
