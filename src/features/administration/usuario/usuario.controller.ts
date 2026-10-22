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
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CreateUsuarioDto, UpdateEstadoUsuarioDto, UpdateUsuarioDto, UsuarioResponseDto } from './usuario.dto.js';
import { UsuarioHandler } from './usuario.handler.js';
import type { AuthUser } from '../../../platform/auth/auth-user.js';
import { CurrentUser } from '../../../platform/auth/current-user.decorator.js';
import { Modulo } from '../../../platform/auth/permisos.decorator.js';

@ApiTags('administration/usuarios')
@Controller('administration/usuarios')
@Modulo('admin.usuarios')
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
  @ApiConflictResponse({
    description: 'Otro usuario ya usa ese login / Debe quedar al menos un Administrador activo (al quitarle el rol al último)',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUsuarioDto,
  ): Promise<UsuarioResponseDto> {
    return this.handler.update(id, dto);
  }

  @Patch(':id/estado')
  @ApiOperation({
    summary: 'Desactivar o reactivar un usuario',
    description:
      'Un usuario inactivo no puede iniciar sesión y su sesión abierta se corta en la siguiente petición (403 USUARIO_INACTIVO). No se borra nada.',
  })
  @ApiParam({ name: 'id', description: 'Identificador único del usuario', example: 'USR-0003' })
  @ApiOkResponse({ type: UsuarioResponseDto, description: 'Usuario con su nuevo estado' })
  @ApiBadRequestResponse({ description: '`activo` ausente o no booleano' })
  @ApiForbiddenResponse({ description: 'Sin permiso en Usuarios (403 SIN_PERMISO)' })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado' })
  @ApiConflictResponse({
    description: 'No puedes desactivar tu propio usuario / Debe quedar al menos un Administrador activo',
  })
  cambiarEstado(
    @Param('id') id: string,
    @Body() dto: UpdateEstadoUsuarioDto,
    @CurrentUser() user: AuthUser,
  ): Promise<UsuarioResponseDto> {
    return this.handler.cambiarEstado(id, dto.activo, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un usuario' })
  @ApiParam({ name: 'id', description: 'Identificador único del usuario', example: 'U-001' })
  @ApiNoContentResponse({ description: 'Usuario eliminado exitosamente' })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado' })
  @ApiConflictResponse({
    description: 'No puedes eliminar tu propio usuario / Debe quedar al menos un Administrador activo',
  })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<void> {
    return this.handler.remove(id, user.id);
  }
}