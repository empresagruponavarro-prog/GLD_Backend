import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export const ROL_NOMBRE_MIN = 2;
export const ROL_NOMBRE_MAX = 50;
export const ROL_DESCRIPCION_MAX = 255;

/** Letras (con tildes y ñ), números, espacios, guion y punto. */
export const ROL_NOMBRE_PATRON = /^[\p{L}\p{N} .-]+$/u;

const MENSAJE_NOMBRE =
  'nombre solo admite letras, números, espacios, guion y punto';

/** Recorta espacios extremos si llega un string. */
const recortar = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

export class CreateRolDto {
  @ApiProperty({
    example: 'Almacenero',
    minLength: ROL_NOMBRE_MIN,
    maxLength: ROL_NOMBRE_MAX,
    description: 'Nombre único (sin distinguir mayúsculas). Letras, números, espacios, guion y punto',
  })
  @recortar()
  @IsString()
  @IsNotEmpty()
  @Length(ROL_NOMBRE_MIN, ROL_NOMBRE_MAX)
  @Matches(ROL_NOMBRE_PATRON, { message: MENSAJE_NOMBRE })
  nombre: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: ROL_DESCRIPCION_MAX,
    example: 'Registra ingresos y salidas de almacén',
  })
  @recortar()
  @IsOptional()
  @IsString()
  @MaxLength(ROL_DESCRIPCION_MAX)
  descripcion?: string | null;
}

export class UpdateRolDto {
  @ApiPropertyOptional({
    minLength: ROL_NOMBRE_MIN,
    maxLength: ROL_NOMBRE_MAX,
    description:
      'Nuevo nombre; actualiza también usuarios.Rol de quienes tenían el anterior. Un rol del sistema no se puede renombrar',
  })
  @recortar()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(ROL_NOMBRE_MIN, ROL_NOMBRE_MAX)
  @Matches(ROL_NOMBRE_PATRON, { message: MENSAJE_NOMBRE })
  nombre?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: ROL_DESCRIPCION_MAX })
  @recortar()
  @IsOptional()
  @IsString()
  @MaxLength(ROL_DESCRIPCION_MAX)
  descripcion?: string | null;
}

export class RolResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Administrador' })
  nombre: string;

  @ApiProperty({ type: String, nullable: true, example: 'Acceso total, incluida la administración de usuarios y empresas' })
  descripcion: string | null;

  @ApiProperty({ example: true, description: 'Rol del sistema: no se puede renombrar ni eliminar' })
  es_sistema: boolean;

  @ApiProperty({ example: 2, description: 'Cantidad de usuarios con este rol (comparación exacta del nombre)' })
  usuarios: number;
}
