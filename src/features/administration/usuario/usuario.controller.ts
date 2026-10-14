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
  ApiBadRequestResponse,
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
import { Roles } from '../../../platform/auth/roles.decorator.js';
import { ROL_ADMINISTRADOR } from '../../../platform/auth/roles.js';

@ApiTags('administration/usuarios')
@Controller('administration/usuarios')
@Roles(ROL_ADMINISTRADOR)
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
  @ApiOperation({ summary: 'Listar los nombres de los roles (tabla rol)' })
  @ApiOkResponse({
    type: [String],
    description: 'Nombres de los roles, primero los del sistema y luego por nombre. El detalle está en GET /administration/roles',
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
  @ApiBadRequestResponse({ description: 'Datos inválidos o el rol indicado no existe en la tabla rol' })
  @ApiConflictResponse({ description: 'Ya existe un usuario con este identificador o login' })
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
  @ApiBadRequestResponse({ description: 'Datos inválidos o el rol indicado no existe en la tabla rol' })
  @ApiConflictResponse({ description: 'Otro usuario ya usa ese login' })
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