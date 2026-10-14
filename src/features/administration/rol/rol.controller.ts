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
import { Roles } from '../../../platform/auth/roles.decorator.js';
import { ROL_ADMINISTRADOR } from '../../../platform/auth/roles.js';
import { CreateRolDto, RolResponseDto, UpdateRolDto } from './rol.dto.js';
import { RolHandler } from './rol.handler.js';

@ApiTags('administration/roles')
@Controller('administration/roles')
@Roles(ROL_ADMINISTRADOR)
export class RolController {
  constructor(private readonly handler: RolHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar roles con su cantidad de usuarios' })
  @ApiOkResponse({
    type: RolResponseDto,
    isArray: true,
    description: 'Primero los roles del sistema y luego por nombre',
  })
  list(): Promise<RolResponseDto[]> {
    return this.handler.list();
  }

  @Post()
  @ApiOperation({ summary: 'Crear un rol' })
  @ApiCreatedResponse({ type: RolResponseDto, description: 'Rol creado (usuarios: 0)' })
  @ApiBadRequestResponse({ description: 'Nombre o descripción inválidos' })
  @ApiConflictResponse({ description: 'Ya existe un rol con ese nombre (sin distinguir mayúsculas)' })
  create(@Body() dto: CreateRolDto): Promise<RolResponseDto> {
    return this.handler.create(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar un rol',
    description:
      'Renombrar actualiza usuarios.Rol de quienes tenían el nombre anterior en la misma transacción. Un rol del sistema solo admite cambiar la descripción.',
  })
  @ApiParam({ name: 'id', type: Number, example: 2 })
  @ApiOkResponse({ type: RolResponseDto, description: 'Rol actualizado' })
  @ApiBadRequestResponse({ description: 'Nombre o descripción inválidos' })
  @ApiNotFoundResponse({ description: 'Rol no encontrado' })
  @ApiConflictResponse({ description: 'Nombre duplicado o rol del sistema que no se puede renombrar' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRolDto,
  ): Promise<RolResponseDto> {
    return this.handler.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un rol' })
  @ApiParam({ name: 'id', type: Number, example: 2 })
  @ApiNoContentResponse({ description: 'Rol eliminado' })
  @ApiNotFoundResponse({ description: 'Rol no encontrado' })
  @ApiConflictResponse({ description: 'Rol del sistema o con usuarios asignados' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.handler.remove(id);
  }
}
