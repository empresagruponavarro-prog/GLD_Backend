import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** Permisos de un rol en un módulo (una fila de la matriz). */
export class PermisoModuloDto {
  @ApiProperty({ example: 10 })
  moduloId: number;

  @ApiProperty({ example: 'tesoreria.pagos' })
  clave: string;

  @ApiProperty({ example: true })
  ver: boolean;

  @ApiProperty({ example: true })
  crear: boolean;

  @ApiProperty({ example: true })
  editar: boolean;

  @ApiProperty({ example: false })
  eliminar: boolean;

  @ApiProperty({ example: false, description: 'Siempre false si el módulo no admite Aprobar' })
  aprobar: boolean;

  @ApiProperty({ example: true, description: 'Siempre false si el módulo no admite Anular' })
  anular: boolean;
}

export class MatrizPermisosDto {
  @ApiProperty({ example: 2 })
  rolId: number;

  @ApiProperty({ example: 'Promotor' })
  rol: string;

  @ApiProperty({ example: false, description: 'Rol del sistema (Administrador)' })
  esSistema: boolean;

  @ApiProperty({
    example: false,
    description: 'true para el Administrador: tiene todos los permisos y la matriz no se puede modificar',
  })
  bloqueado: boolean;

  @ApiProperty({
    type: PermisoModuloDto,
    isArray: true,
    description: 'Una entrada por módulo activo, en el orden del catálogo (false si no hay nada guardado)',
  })
  permisos: PermisoModuloDto[];
}

/** Entrada del PUT: permisos de un módulo identificado por su clave. */
export class PermisoEntradaDto {
  @ApiProperty({ example: 'tesoreria.pagos', maxLength: 80 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  clave: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  ver: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  crear: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  editar: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  eliminar: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  aprobar: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  anular: boolean;
}

export class ActualizarPermisosDto {
  @ApiProperty({
    type: PermisoEntradaDto,
    isArray: true,
    description: 'Exactamente una entrada por cada módulo activo del catálogo',
  })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PermisoEntradaDto)
  permisos: PermisoEntradaDto[];
}
