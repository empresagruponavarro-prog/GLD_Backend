import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ESTADOS_SEMANA } from '../shared/obra-shared.js';

export class ObraSemanaDto {
  @ApiProperty() id: number;
  @ApiProperty() numero_semana: number;
  @ApiProperty() etiqueta_semana: string;
  @ApiProperty() fecha_inicio: string;
  @ApiProperty() fecha_fin: string;
  @ApiProperty() fase_principal: string;
  @ApiPropertyOptional() descripcion_actividades?: string;
  @ApiPropertyOptional() responsable_nombre?: string;
  @ApiProperty() porcentaje_meta: number;
  @ApiProperty() porcentaje_real: number;
  @ApiProperty({ enum: ESTADOS_SEMANA }) estado: string;
  @ApiProperty() orden: number;
}
