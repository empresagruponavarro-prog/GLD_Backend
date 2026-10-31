import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

/**
 * `?hoy=YYYY-MM-DD`: permite consultar el control «como estaba» una fecha (solo en lecturas). Si se
 * omite se usa la fecha de hoy en Lima.
 */
export class HoyQueryDto {
  @ApiPropertyOptional({ example: '2026-10-19' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'hoy debe ser YYYY-MM-DD' })
  hoy?: string;
}
