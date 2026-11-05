import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class TipoProyectoPlanoDto {
  @ApiProperty() id_tipo_plano: number;
  @ApiProperty() codigo: string;
  @ApiProperty() nombre: string;
  @ApiProperty({ description: 'Si falta, bloquea la liquidación y el dosier de la obra' }) obligatorio: boolean;
}

export class TipoProyectoDto {
  @ApiProperty() id: number;
  @ApiProperty({ example: 'TAMBO' }) nombre: string;
  @ApiProperty() activo: boolean;
  @ApiProperty() orden: number;
  @ApiProperty({ type: TipoProyectoPlanoDto, isArray: true }) planos: TipoProyectoPlanoDto[];
}

export class CreateTipoProyectoDto {
  @ApiProperty({ example: 'TAMBO' }) @IsString() @IsNotEmpty() @MaxLength(80) @Transform(recortar) nombre: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Type(() => Number) orden?: number;
}

export class UpdateTipoProyectoDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(80) @Transform(recortar) nombre?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activo?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Type(() => Number) orden?: number;
}

export class PlanoDeTipoProyectoDto {
  @ApiProperty() @IsInt() @Type(() => Number) id_tipo_plano: number;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() obligatorio?: boolean;
}

export class SetPlanosTipoProyectoDto {
  @ApiProperty({ type: PlanoDeTipoProyectoDto, isArray: true, description: 'La lista completa: reemplaza a la anterior' })
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => PlanoDeTipoProyectoDto)
  planos: PlanoDeTipoProyectoDto[];
}
