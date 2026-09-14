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

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una empresa por id' })
  @ApiParam({ name: 'id', description: 'Identificador de la empresa', example: 1 })
  @ApiOkResponse({ type: EmpresaResponseDto, description: 'Empresa encontrada' })
  @ApiNotFoundResponse({ description: 'Empresa no encontrada' })
  getById(@Param('id') id: string): Promise<EmpresaResponseDto> {
    return this.handler.getById(Number(id));
  }

  @Post()
  @ApiOperation({ summary: 'Crear una empresa' })
  @ApiCreatedResponse({ type: EmpresaResponseDto, description: 'Empresa creada exitosamente' })
  create(@Body() dto: CreateEmpresaDto): Promise<EmpresaResponseDto> {
    return this.handler.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una empresa' })
  @ApiParam({ name: 'id', description: 'Identificador de la empresa', example: 1 })
  @ApiOkResponse({ type: EmpresaResponseDto, description: 'Empresa actualizada exitosamente' })
  @ApiNotFoundResponse({ description: 'Empresa no encontrada' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEmpresaDto,
  ): Promise<EmpresaResponseDto> {
    return this.handler.update(Number(id), dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una empresa' })
  @ApiParam({ name: 'id', description: 'Identificador de la empresa', example: 1 })
  @ApiNoContentResponse({ description: 'Empresa eliminada exitosamente' })
  @ApiNotFoundResponse({ description: 'Empresa no encontrada' })
  remove(@Param('id') id: string): Promise<void> {
    return this.handler.remove(Number(id));
  }
}