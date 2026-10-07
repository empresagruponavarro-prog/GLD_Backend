import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConsultaHandler } from './consulta.handler.js';
import { ConsultaQueryDto, ConsultaResponseDto } from './consulta.dto.js';

@ApiTags('almacen/consulta')
@Controller('almacen/consulta')
export class ConsultaController {
  constructor(private readonly handler: ConsultaHandler) {}

  @Get()
  @ApiOperation({ summary: 'Consulta rápida por código o nombre: ficha, stock por almacén y alternativas' })
  @ApiOkResponse({ type: ConsultaResponseDto })
  buscar(@Query() query: ConsultaQueryDto): Promise<ConsultaResponseDto> {
    return this.handler.buscar(query.q);
  }
}
