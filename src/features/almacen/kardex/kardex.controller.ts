import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Paginated } from '../../../platform/db/pagination.js';
import { KardexHandler } from './kardex.handler.js';
import { KardexResponseDto, ListKardexQueryDto } from './kardex.dto.js';

@ApiTags('almacen/kardex')
@Controller('almacen/kardex')
export class KardexController {
  constructor(private readonly handler: KardexHandler) {}

  @Get()
  @ApiOperation({ summary: 'Kardex valorizado en orden de registro, con saldo corrido (los préstamos no aparecen)' })
  @ApiOkResponse({ description: 'Lista paginada' })
  list(@Query() query: ListKardexQueryDto): Promise<Paginated<KardexResponseDto>> {
    return this.handler.list(query);
  }
}
