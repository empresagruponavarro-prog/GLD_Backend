import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
import { CreateEmpresaDto, EmpresaResponseDto, UpdateEmpresaDto } from './empresa.dto.js';
import { EmpresaHandler } from './empresa.handler.js';

@ApiTags('administration/empresas')
@Controller('administration/empresas')
export class EmpresaController {
  constructor(private readonly handler: EmpresaHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar empresas' })
  @ApiOkResponse({ type: EmpresaResponseDto, isArray: true, description: 'Lista de empresas registradas' })
  list(): Promise<EmpresaResponseDto[]> {
    return this.handler.list();
  }

  @Get(':cod')
  @ApiOperation({ summary: 'Obtener una empresa por código' })
  @ApiParam({ name: 'cod', description: 'Código único de la empresa', example: 'E1' })
  @ApiOkResponse({ type: EmpresaResponseDto, description: 'Empresa encontrada' })
  @ApiNotFoundResponse({ description: 'Empresa no encontrada' })
  getById(@Param('cod') cod: string): Promise<EmpresaResponseDto> {
    return this.handler.getById(cod);
  }

  @Post()
  @ApiOperation({ summary: 'Crear una empresa' })
  @ApiCreatedResponse({ type: EmpresaResponseDto, description: 'Empresa creada exitosamente' })
  create(@Body() dto: CreateEmpresaDto): Promise<EmpresaResponseDto> {
    return this.handler.create(dto);
  }

  @Patch(':cod')
  @ApiOperation({ summary: 'Actualizar una empresa' })
  @ApiParam({ name: 'cod', description: 'Código único de la empresa', example: 'E1' })
  @ApiOkResponse({ type: EmpresaResponseDto, description: 'Empresa actualizada exitosamente' })
  @ApiNotFoundResponse({ description: 'Empresa no encontrada' })
  update(
    @Param('cod') cod: string,
    @Body() dto: UpdateEmpresaDto,
  ): Promise<EmpresaResponseDto> {
    return this.handler.update(cod, dto);
  }

  @Delete(':cod')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una empresa' })
  @ApiParam({ name: 'cod', description: 'Código único de la empresa', example: 'E1' })
  @ApiNoContentResponse({ description: 'Empresa eliminada exitosamente' })
  @ApiNotFoundResponse({ description: 'Empresa no encontrada' })
  remove(@Param('cod') cod: string): Promise<void> {
    return this.handler.remove(cod);
  }
}