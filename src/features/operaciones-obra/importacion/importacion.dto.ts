import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class ImportarExcelQueryDto {
  @ApiPropertyOptional({ default: false, description: 'false = solo la vista previa (no escribe nada); true = importa' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  confirmar?: boolean;
}

export class MensajeImportacionDto {
  @ApiProperty({ example: 'Partidas f. 12' }) fila: string;
  @ApiPropertyOptional() nombre?: string;
  @ApiProperty() mensaje: string;
}

export class PersonaImportacionDto {
  @ApiProperty() id: number;
  @ApiProperty() nombre: string;
}

export class EquipoImportacionDto {
  @ApiProperty({ enum: ['jefe_proyecto', 'coordinador', 'residente', 'resp_presupuesto', 'resp_procura'] }) rol: string;
  @ApiProperty({ description: 'Lo que dice el archivo' }) texto: string;
  @ApiPropertyOptional({ type: PersonaImportacionDto, nullable: true, description: 'Trabajador del maestro al que corresponde; nulo si no se encontró o es ambiguo' })
  persona: PersonaImportacionDto | null;
}

export class ResumenImportacionDto {
  @ApiProperty() partidas: number;
  @ApiProperty() subpartidas: number;
  @ApiProperty({ description: 'Subpartidas con al menos una semana de avance' }) subpartidas_con_avance: number;
  @ApiProperty({ description: 'Metas escritas a mano (semana × subpartida)' }) metas_manuales: number;
  @ApiProperty() reprogramaciones: number;
}

export class ObraActualImportacionDto {
  @ApiProperty({ nullable: true }) codigo_obra: string | null;
  @ApiProperty({ nullable: true }) estado_obra: string | null;
  @ApiProperty() partidas: number;
  @ApiProperty() subpartidas: number;
  @ApiProperty() con_avance: boolean;
  @ApiProperty() reprogramaciones: number;
}

export class VistaPreviaImportacionDto {
  @ApiProperty() archivo: string;
  @ApiProperty({ description: 'false si hay errores: no se puede confirmar' }) importable: boolean;
  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Ficha leída del archivo' }) ficha: Record<string, unknown>;
  @ApiProperty({ type: ResumenImportacionDto }) resumen: ResumenImportacionDto;
  @ApiProperty({ type: [EquipoImportacionDto] }) equipo: EquipoImportacionDto[];
  @ApiProperty({ type: ObraActualImportacionDto }) obra_actual: ObraActualImportacionDto;
  @ApiProperty({ description: 'La obra ya tenía estructura y esta importación la reemplaza' }) reemplaza_estructura: boolean;
  @ApiProperty({ type: [MensajeImportacionDto] }) errores: MensajeImportacionDto[];
  @ApiProperty({ type: [MensajeImportacionDto] }) avisos: MensajeImportacionDto[];
}

export class ResultadoImportacionExcelDto {
  @ApiProperty() importado: boolean;
  @ApiProperty({ type: ResumenImportacionDto }) resumen: ResumenImportacionDto;
  @ApiProperty({ type: [MensajeImportacionDto] }) avisos: MensajeImportacionDto[];
}
