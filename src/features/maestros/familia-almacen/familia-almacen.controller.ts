import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FamiliaAlmacenHandler } from './familia-almacen.handler.js';
import {
  CreateFamiliaAlmacenDto,
  FamiliaAlmacenResponseDto,
  FamiliaAlmacenSelectResponseDto,
  UpdateFamiliaAlmacenDto,
} from './familia-almacen.dto.js';

@ApiTags('maestros/familia-almacen')
@Controller('maestros/familia-almacen')
export class FamiliaAlmacenController {
  constructor(private readonly handler: FamiliaAlmacenHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar familias de almacén (prefijos de código)' })
  @ApiOkResponse({ type: FamiliaAlmacenResponseDto, isArray: true })
  list(): Promise<FamiliaAlmacenResponseDto[]> {
    return this.handler.list();
  }

  @Get('select')
  @ApiOperation({ summary: 'Familias activas para selector' })
  @ApiOkResponse({ type: FamiliaAlmacenSelectResponseDto, isArray: true })
  select(): Promise<FamiliaAlmacenSelectResponseDto[]> {
    return this.handler.select();
  }

  @Post()
  @ApiOperation({ summary: 'Crear familia' })
  @ApiCreatedResponse({ type: FamiliaAlmacenResponseDto })
  @ApiConflictResponse({ description: 'Prefijo duplicado' })
  create(@Body() dto: CreateFamiliaAlmacenDto): Promise<FamiliaAlmacenResponseDto> {
    return this.handler.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar nombre / estado (el prefijo no se edita)' })
  @ApiOkResponse({ type: FamiliaAlmacenResponseDto })
  @ApiNotFoundResponse({ description: 'No existe' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateFamiliaAlmacenDto): Promise<FamiliaAlmacenResponseDto> {
    return this.handler.update(id, dto);
  }
}
