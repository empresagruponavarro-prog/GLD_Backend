import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { LecturaCompartida, Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import { OpcionUbigeoDto, UbicacionDto } from './ubigeo.dto.js';
import { UbigeoHandler } from './ubigeo.handler.js';
import { ParseCodigoUbigeoPipe } from './ubigeo.pipe.js';

/** Catálogo ubigeo INEI (solo lectura, para cualquier usuario con sesión). */
@ApiTags('maestros/ubigeo')
@Controller('maestros/ubigeo')
@Modulo('maestros.generales')
export class UbigeoController {
  constructor(private readonly handler: UbigeoHandler) {}

  @LecturaCompartida()
  @Get('departamentos')
  @ApiOperation({ summary: 'Departamentos (código de 2 dígitos)' })
  @ApiOkResponse({ type: OpcionUbigeoDto, isArray: true })
  departamentos(): Promise<OpcionUbigeoDto[]> {
    return this.handler.departamentos();
  }

  @LecturaCompartida()
  @Get('provincias')
  @ApiOperation({ summary: 'Provincias de un departamento (código de 4 dígitos)' })
  @ApiQuery({ name: 'departamento', example: '15' })
  @ApiOkResponse({ type: OpcionUbigeoDto, isArray: true })
  provincias(@Query('departamento', new ParseCodigoUbigeoPipe(2)) departamento: string): Promise<OpcionUbigeoDto[]> {
    return this.handler.provincias(departamento);
  }

  @LecturaCompartida()
  @Get('distritos')
  @ApiOperation({ summary: 'Distritos de una provincia (código ubigeo de 6 dígitos)' })
  @ApiQuery({ name: 'provincia', example: '1501' })
  @ApiOkResponse({ type: OpcionUbigeoDto, isArray: true })
  distritos(@Query('provincia', new ParseCodigoUbigeoPipe(4)) provincia: string): Promise<OpcionUbigeoDto[]> {
    return this.handler.distritos(provincia);
  }

  @LecturaCompartida()
  @Get('distritos/:id')
  @ApiOperation({ summary: 'Ubicación completa (departamento, provincia y distrito) de un ubigeo' })
  @ApiOkResponse({ type: UbicacionDto })
  @ApiNotFoundResponse({ description: 'El ubigeo no existe' })
  ubicacion(@Param('id', new ParseCodigoUbigeoPipe(6)) id: string): Promise<UbicacionDto> {
    return this.handler.ubicacion(id);
  }
}
