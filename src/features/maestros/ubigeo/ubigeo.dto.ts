import { ApiProperty } from '@nestjs/swagger';

/** Opción de un catálogo ubigeo: código INEI (2, 4 o 6 dígitos) y nombre. */
export class OpcionUbigeoDto {
  @ApiProperty({ example: '150142' }) id: string;
  @ApiProperty({ example: 'VILLA EL SALVADOR' }) nombre: string;
}

export class UbicacionDto {
  @ApiProperty({ example: '150142' }) id_distrito: string;
  @ApiProperty({ example: '1501' }) id_provincia: string;
  @ApiProperty({ example: '15' }) id_departamento: string;
  @ApiProperty({ example: 'LIMA' }) departamento: string;
  @ApiProperty({ example: 'LIMA' }) provincia: string;
  @ApiProperty({ example: 'VILLA EL SALVADOR' }) distrito: string;
}
