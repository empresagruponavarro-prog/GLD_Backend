import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateEmpresaDto {
  @ApiPropertyOptional({ example: '20123456789' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  ruc?: string;

  @ApiPropertyOptional({ example: 'GLD SERVICIOS GENERALES EIRL' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  razon_social?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  domicilio_fiscal?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  direccion_entrega?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  correo_compras?: string;
}

export class UpdateEmpresaDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  ruc?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  razon_social?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  domicilio_fiscal?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  direccion_entrega?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  correo_compras?: string;
}

export class EmpresaResponseDto {
  @ApiProperty({ example: 1, description: 'Identificador de la empresa' })
  id_empresa: number;

  @ApiProperty({ example: '20123456789', description: 'RUC de la empresa' })
  ruc: string | null;

  @ApiProperty({ example: 'GLD SERVICIOS GENERALES EIRL', description: 'Razón social' })
  razon_social: string | null;

  @ApiProperty({ example: 'Av. Principal 123', description: 'Domicilio fiscal' })
  domicilio_fiscal: string | null;

  @ApiProperty({ example: 'Av. Principal 123', description: 'Dirección de entrega' })
  direccion_entrega: string | null;

  @ApiProperty({ example: 'compras@empresa.com', description: 'Correo de contacto para compras' })
  correo_compras: string | null;
}

export type EmpresaRow = EmpresaResponseDto;