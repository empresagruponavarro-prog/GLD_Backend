import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsIn, IsOptional } from 'class-validator';
import { TIPOS_EVENTO_OBRA } from '../shared/control-avance/registrar-evento.js';

export class PreferenciasAvisosDto {
  @ApiPropertyOptional({
    isArray: true,
    enum: TIPOS_EVENTO_OBRA,
    nullable: true,
    description: 'Tipos de evento que cuentan como avisos para esta persona. Nulo o ausente = todos.',
  })
  @IsOptional() @IsArray() @ArrayUnique() @IsIn(TIPOS_EVENTO_OBRA, { each: true })
  tipos_importantes?: string[] | null;
}

export class EstadoAvisosDto {
  @ApiProperty({ nullable: true, description: 'Los avisos anteriores a este instante ya se leyeron' }) visto_hasta: string | null;
  @ApiProperty({ nullable: true, type: [String], description: 'Tipos elegidos; nulo = todos' }) tipos_importantes: string[] | null;
  @ApiProperty({ description: 'Avisos sin leer (de los tipos elegidos), hasta 200' }) no_leidos: number;
}
