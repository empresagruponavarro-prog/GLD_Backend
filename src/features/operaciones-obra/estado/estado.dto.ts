import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ESTADOS_OBRA } from '../shared/control-avance/control-avance.types.js';

export class CambiarEstadoObraDto {
  @ApiProperty({ enum: ESTADOS_OBRA }) @IsIn(ESTADOS_OBRA) estado: string;

  @ApiPropertyOptional({
    example: '2026-10-30',
    description: 'POST_VENTA: fecha de entrega real. CULMINADO: fecha de cierre de la post venta. Por defecto, hoy (Lima).',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fecha debe ser YYYY-MM-DD' })
  fecha?: string;

  @ApiPropertyOptional({ description: 'Observaciones de la post venta (solo POST_VENTA y CULMINADO) o motivo del cambio' })
  @IsOptional() @IsString() @MaxLength(200)
  observaciones?: string;

  @ApiPropertyOptional({ description: 'Confirma entregar una obra que no llegó al 100 % de avance' })
  @IsOptional() @IsBoolean()
  confirmar?: boolean;
}

export class CambioEstadoObraDto {
  @ApiProperty({ nullable: true }) anterior: string | null;
  @ApiProperty() estado: string;
  @ApiProperty() fecha: string;
  @ApiProperty({ type: [String], description: 'Avisos que no impidieron el cambio' }) avisos: string[];
}
