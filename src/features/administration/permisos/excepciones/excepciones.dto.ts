import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { PermisoEntradaDto } from '../matriz/matriz.dto.js';

/** Las 6 acciones de un módulo. */
export class AccionesDto {
  @ApiProperty({ example: true })
  ver: boolean;

  @ApiProperty({ example: true })
  crear: boolean;

  @ApiProperty({ example: true })
  editar: boolean;

  @ApiProperty({ example: false })
  eliminar: boolean;

  @ApiProperty({ example: false })
  aprobar: boolean;

  @ApiProperty({ example: false })
  anular: boolean;
}

export class AreaDelUsuarioDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'PROCURA' })
  codigo: string;

  @ApiProperty({ example: 'Procura' })
  nombre: string;
}

/** Cómo se llega al permiso de una persona en un módulo: rol → área → excepción. */
export class PermisoUsuarioModuloDto {
  @ApiProperty({ example: 10 })
  id: number;

  @ApiProperty({ example: 'tesoreria.pagos' })
  clave: string;

  @ApiProperty({ example: 'Ejecución de pagos' })
  nombre: string;

  @ApiProperty({ example: 'Tesorería' })
  grupo: string;

  @ApiProperty({ example: false })
  admite_aprobar: boolean;

  @ApiProperty({ example: true })
  admite_anular: boolean;

  @ApiProperty({
    enum: ['sin_restriccion', 'no', 'solo_ver', 'completo'],
    example: 'completo',
    description:
      'Estado del módulo en el área del usuario. `sin_restriccion` = no se filtra (sin área, área sin configurar o módulo de Administración)',
  })
  area: 'sin_restriccion' | 'no' | 'solo_ver' | 'completo';

  @ApiProperty({ type: AccionesDto, description: 'Lo que da el ROL en este módulo' })
  rol: AccionesDto;

  @ApiProperty({ type: AccionesDto, description: 'Lo que queda tras el filtro del ÁREA (antes de la excepción)' })
  tras_area: AccionesDto;

  @ApiProperty({ type: AccionesDto, nullable: true, description: 'Excepción del usuario en este módulo (null = no tiene)' })
  excepcion: AccionesDto | null;

  @ApiProperty({ type: AccionesDto, description: 'Lo que la persona puede hacer de verdad (el que aplica la API)' })
  efectivo: AccionesDto;

  @ApiProperty({ enum: ['rol', 'area', 'excepcion'], example: 'rol', description: 'De dónde sale el resultado' })
  origen: 'rol' | 'area' | 'excepcion';
}

export class PermisosUsuarioDto {
  @ApiProperty({ example: 'USR-0001' })
  id_usuario: string;

  @ApiProperty({ example: 'Juan Pérez' })
  nombres: string;

  @ApiProperty({ example: 'jperez' })
  usuario: string;

  @ApiProperty({ example: 'Usuario' })
  rol: string;

  @ApiProperty({ type: AreaDelUsuarioDto, nullable: true })
  area: AreaDelUsuarioDto | null;

  @ApiProperty({ example: true, description: 'true si el área del usuario tiene módulos configurados (el filtro de área aplica)' })
  area_configurada: boolean;

  @ApiProperty({ example: false, description: 'true para el Administrador: tiene todo y no admite excepciones' })
  es_administrador: boolean;

  @ApiProperty({ example: false, description: 'true si el usuario tiene al menos una excepción propia' })
  personalizado: boolean;

  @ApiProperty({ type: PermisoUsuarioModuloDto, isArray: true, description: 'Una entrada por módulo activo, en el orden del catálogo' })
  modulos: PermisoUsuarioModuloDto[];
}

export class ActualizarExcepcionesDto {
  @ApiProperty({
    type: PermisoEntradaDto,
    isArray: true,
    description:
      'Las excepciones del usuario: solo los módulos que se salen de lo que dan su rol y su área. ' +
      'Una entrada reemplaza el módulo completo (con todo en false lo quita del usuario). Puede ir vacío.',
  })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PermisoEntradaDto)
  excepciones: PermisoEntradaDto[];
}
