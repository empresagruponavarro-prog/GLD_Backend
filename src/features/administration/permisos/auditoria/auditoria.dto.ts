import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

export class AuditoriaPermisosQueryDto {
  @ApiPropertyOptional({
    example: '2026-10-15',
    description: 'Solo negativas desde esta fecha/hora (ISO 8601, inclusive)',
  })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'desde debe ser una fecha ISO 8601 (p. ej. 2026-10-15)' })
  desde?: string;
}

/** Negativas agrupadas por módulo + acción + rol + método + ruta. */
export class ResumenAuditoriaPermisosDto {
  @ApiProperty({ example: 'tesoreria.pagos' })
  modulo: string;

  @ApiProperty({ example: 'crear', enum: ['ver', 'crear', 'editar', 'eliminar', 'aprobar', 'anular'] })
  accion: string;

  @ApiProperty({ example: 'Jefe de Área' })
  rol: string;

  @ApiProperty({ example: 'POST' })
  metodo: string;

  @ApiProperty({ example: '/tesoreria/pagos/:id/anular', description: 'Ruta declarada (sin ids ni query)' })
  ruta: string;

  @ApiProperty({ example: 12, description: 'Veces que se negó (o se habría negado en modo auditoría)' })
  veces: number;

  @ApiProperty({ example: '2026-10-15T15:04:05.000Z', description: 'Última vez (ISO 8601)' })
  ultima: string;
}
