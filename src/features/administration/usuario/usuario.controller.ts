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
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreateUsuarioDto,
  UpdateUsuarioDto,
  UsuarioResponseDto,
} from './usuario.dto.js';
import { UsuarioHandler } from './usuario.handler.js';

@ApiTags('administration/usuarios')
@Controller('administration/usuarios')
export class UsuarioController {
  constructor(private readonly handler: UsuarioHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar usuarios' })
  @ApiOkResponse({
    type: UsuarioResponseDto,
    isArray: true,
    description: 'Lista de usuarios registrados',
  })
  list(): Promise<UsuarioResponseDto[]> {
    return this.handler.list();
  }

  @Get('roles')
  @ApiOperation({ summary: 'Listar roles disponibles' })
  @ApiOkResponse({
    type: [String],
    description: 'Lista de roles disponibles',
  })
  getRoles(): Promise<string[]> {
    return this.handler.getRoles();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un usuario por id' })
  @ApiParam({ name: 'id', description: 'Identificador único del usuario', example: 'U-001' })
  @ApiOkResponse({ type: UsuarioResponseDto, description: 'Usuario encontrado' })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado' })
  getById(@Param('id') id: string): Promise<UsuarioResponseDto> {
    return this.handler.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un usuario' })
  @ApiCreatedResponse({
    type: UsuarioResponseDto,
    description: 'Usuario creado exitosamente',
  })
  @ApiConflictResponse({ description: 'Ya existe un usuario con este identificador' })
  create(@Body() dto: CreateUsuarioDto): Promise<UsuarioResponseDto> {
    return this.handler.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un usuario' })
  @ApiParam({ name: 'id', description: 'Identificador único del usuario', example: 'U-001' })
  @ApiOkResponse({
    type: UsuarioResponseDto,
    description: 'Usuario actualizado exitosamente',
  })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUsuarioDto,
  ): Promise<UsuarioResponseDto> {
    return this.handler.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un usuario' })
  @ApiParam({ name: 'id', description: 'Identificador único del usuario', example: 'U-001' })
  @ApiNoContentResponse({ description: 'Usuario eliminado exitosamente' })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado' })
  remove(@Param('id') id: string): Promise<void> {
    return this.handler.remove(id);
  }
}