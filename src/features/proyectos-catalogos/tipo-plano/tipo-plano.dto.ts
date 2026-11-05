import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/**
 * `disciplina` es un conjunto fijo («Arquitectura»…) en los planos de la obra, y el filtro global de mayúsculas excluye por
 * nombre los campos así; aquí es texto libre, por eso se convierte con su propio transform.
 */
const mayusculas = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

export class TipoPlanoDto {
  @ApiProperty() id: number;
  @ApiProperty({ example: 'ARQ' }) codigo: string;
  @ApiProperty({ example: 'ARQUITECTURA' }) nombre: string;
  @ApiPropertyOptional({ nullable: true }) disciplina: string | null;
  @ApiProperty() activo: boolean;
  @ApiProperty() orden: number;
}

export class CreateTipoPlanoDto {
  @ApiProperty({ example: 'ARQ' }) @IsString() @IsNotEmpty() @MaxLength(20) @Transform(recortar) codigo: string;
  @ApiProperty({ example: 'ARQUITECTURA' }) @IsString() @IsNotEmpty() @MaxLength(120) @Transform(recortar) nombre: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) @Transform(mayusculas) disciplina?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Type(() => Number) orden?: number;
}

export class UpdateTipoPlanoDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120) @Transform(recortar) nombre?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) @Transform(mayusculas) disciplina?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activo?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Type(() => Number) orden?: number;
}
