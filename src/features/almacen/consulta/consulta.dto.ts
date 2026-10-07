import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { StockAlmacenResponseDto } from '../stock/stock.dto.js';

export class ConsultaQueryDto {
  @ApiProperty({ example: 'CON-0001', description: 'Código exacto o parte de la descripción' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  q: string;
}

export class ConsultaCoincidenciaDto {
  @ApiProperty() id: number;
  @ApiProperty() codigo: string;
  @ApiProperty() descripcion: string;
}

export class ConsultaAlternativaDto {
  @ApiProperty({ example: 1 }) prioridad: number;
  @ApiProperty() id_producto: number;
  @ApiProperty() codigo: string;
  @ApiProperty() descripcion: string;
  @ApiProperty({ example: '12' }) disponible: string;
  @ApiProperty({ example: '20.5' }) costo_promedio: string;
}

export class ConsultaFichaDto {
  @ApiProperty() id: number;
  @ApiProperty() codigo: string;
  @ApiProperty() descripcion: string;
  @ApiProperty() categoria: string;
  @ApiPropertyOptional() familia: string | null;
  @ApiPropertyOptional() uso_principal: string | null;
  @ApiProperty() unidad: string;
  @ApiProperty() clase_inventario: string;
  @ApiProperty() estado_operativo: string;
  @ApiPropertyOptional() almacen_default: string | null;
  @ApiProperty({ example: '86' }) stock_total: string;
  @ApiProperty({ example: '83' }) disponible: string;
  @ApiProperty({ example: '10' }) stock_minimo: string;
  @ApiProperty({ example: '20' }) stock_objetivo: string;
  @ApiProperty({ example: '20.837209' }) costo_promedio: string;
}

export class ConsultaResponseDto {
  @ApiPropertyOptional({ type: ConsultaFichaDto, description: 'Presente si hay una única coincidencia' })
  producto: ConsultaFichaDto | null;

  @ApiProperty({ type: [ConsultaCoincidenciaDto], description: 'Hasta 10 coincidencias cuando no es única' })
  coincidencias: ConsultaCoincidenciaDto[];

  @ApiProperty({ type: [StockAlmacenResponseDto] })
  stock_por_almacen: StockAlmacenResponseDto[];

  @ApiProperty({ type: [ConsultaAlternativaDto] })
  alternativas: ConsultaAlternativaDto[];
}
