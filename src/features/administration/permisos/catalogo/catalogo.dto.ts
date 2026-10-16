import { ApiProperty } from '@nestjs/swagger';

export class ModuloCatalogoDto {
  @ApiProperty({ example: 10 })
  id: number;

  @ApiProperty({ example: 'tesoreria.pagos', description: 'Identificador estable (`ClaveModulo`)' })
  clave: string;

  @ApiProperty({ example: 'Ejecución de pagos' })
  nombre: string;

  @ApiProperty({ type: String, nullable: true, example: '/tesoreria/pagos' })
  ruta: string | null;

  @ApiProperty({ example: 10, description: 'Posición en el catálogo (orden de menú y matriz)' })
  orden: number;

  @ApiProperty({ example: false, description: 'El módulo tiene la acción Aprobar' })
  admiteAprobar: boolean;

  @ApiProperty({ example: true, description: 'El módulo tiene la acción Anular' })
  admiteAnular: boolean;
}

export class GrupoCatalogoDto {
  @ApiProperty({ example: 'Tesorería' })
  grupo: string;

  @ApiProperty({ type: ModuloCatalogoDto, isArray: true })
  modulos: ModuloCatalogoDto[];
}
