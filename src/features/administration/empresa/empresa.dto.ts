import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateEmpresaDto {
  @ApiProperty({ example: 'E1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  CodEmpresa: string;

  @ApiPropertyOptional({ example: '20123456789' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  RUC?: string;

  @ApiPropertyOptional({ example: 'GLD SERVICIOS GENERALES EIRL' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  RazonSocial?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  DomicilioFiscal?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  DireccionEntrega?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  CorreoCompras?: string;
}

export class UpdateEmpresaDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  RUC?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  RazonSocial?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  DomicilioFiscal?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  DireccionEntrega?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  CorreoCompras?: string;
}

export class EmpresaResponseDto {
  @ApiProperty({ example: 'E1', description: 'Código único de la empresa' })
  CodEmpresa: string | null;

  @ApiProperty({ example: '20123456789', description: 'RUC de la empresa' })
  RUC: string | null;

  @ApiProperty({ example: 'GLD SERVICIOS GENERALES EIRL', description: 'Razón social' })
  RazonSocial: string | null;

  @ApiProperty({ example: 'Av. Principal 123', description: 'Domicilio fiscal' })
  DomicilioFiscal: string | null;

  @ApiProperty({ example: 'Av. Principal 123', description: 'Dirección de entrega' })
  DireccionEntrega: string | null;

  @ApiProperty({ example: 'compras@empresa.com', description: 'Correo de contacto para compras' })
  CorreoCompras: string | null;
}

export type EmpresaRow = EmpresaResponseDto;