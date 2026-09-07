import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../platform/db/pagination.dto.js';

export class CreatePptoHistorialDto {
  @ApiProperty({ example: 'PPTO-2026-001', description: 'Código del presupuesto principal' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  IdPresupuesto: string;

  @ApiPropertyOptional({ example: 'PPTO-2026-001-V2', description: 'Identificador de la versión' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  IdPresupuestoVersion?: string;

  @ApiPropertyOptional({ example: '2', description: 'Número de versión' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  NumVersion?: string;

  @ApiPropertyOptional({ example: 'https://storage.../ppto_v2.pdf', description: 'Enlace o ruta del archivo del presupuesto' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  FilePpto?: string;

  @ApiPropertyOptional({ example: 'https://storage.../correo_aprobacion.pdf', description: 'Enlace o ruta del correo de sustento' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  FileCorreo?: string;
}

export class UpdatePptoHistorialDto extends PartialType(CreatePptoHistorialDto) {}

export class ListPptoHistorialQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filtro por IdPresupuesto' })
  @IsOptional()
  @IsString()
  IdPresupuesto?: string;
}

export class PptoHistorialResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiPropertyOptional({ example: 'PPTO-2026-001' })
  IdPresupuesto: string | null;

  @ApiPropertyOptional({ example: 'PPTO-2026-001-V2' })
  IdPresupuestoVersion: string | null;

  @ApiPropertyOptional({ example: '2' })
  NumVersion: string | null;

  @ApiPropertyOptional({ example: 'https://.../ppto.pdf' })
  FilePpto: string | null;

  @ApiPropertyOptional({ example: 'https://.../correo.pdf' })
  FileCorreo: string | null;
}
