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
import { AnexoHandler } from './anexo.handler.js';
import { AnexoResponseDto, CreateAnexoDto, ListAnexoQueryDto, UpdateAnexoDto } from './anexo.dto.js';

@ApiTags('maestros/anexo')
@Controller('maestros/anexo')
export class AnexoController {
  constructor(private readonly handler: AnexoHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar anexos' })
  @ApiOkResponse({ description: 'Lista paginada de anexos' })
  list(@Query() query: ListAnexoQueryDto): Promise<Paginated<AnexoResponseDto>> {
    return this.handler.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un anexo por id' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del anexo' })
  @ApiOkResponse({ type: AnexoResponseDto })
  @ApiNotFoundResponse({ description: 'Anexo no encontrado' })
  getById(@Param('id', ParseIntPipe) id: number): Promise<AnexoResponseDto> {
    return this.handler.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un anexo' })
  @ApiCreatedResponse({ type: AnexoResponseDto })
  create(@Body() dto: CreateAnexoDto): Promise<AnexoResponseDto> {
    return this.handler.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un anexo' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del anexo' })
  @ApiOkResponse({ type: AnexoResponseDto })
  @ApiNotFoundResponse({ description: 'Anexo no encontrado' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAnexoDto,
  ): Promise<AnexoResponseDto> {
    return this.handler.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un anexo' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del anexo' })
  @ApiNoContentResponse({ description: 'Anxo eliminado' })
  @ApiNotFoundResponse({ description: 'Anexo no encontrado' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.handler.remove(id);
  }
}