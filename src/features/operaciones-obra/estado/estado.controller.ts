import { Body, Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../platform/auth/decorators/current-user.decorator.js';
import { Accion, Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import { CambiarEstadoObraDto, CambioEstadoObraDto } from './estado.dto.js';
import { EstadoHandler } from './estado.handler.js';

@ApiTags('Operaciones de Obra · Estado')
@Controller('operaciones/obra/:idCentroCosto/estado')
@Modulo('obra')
@ApiParam({ name: 'idCentroCosto', type: Number })
export class EstadoController {
  constructor(private readonly handler: EstadoHandler) {}

  @Post()
  @Accion('editar') // es un POST, pero modifica la obra existente: exige «editar», no «crear»
  @ApiOperation({
    summary:
      'Cambiar el estado de la obra (Próximo → En ejecución → Post venta → Culminado; Suspendida y Cancelada). Entregar fija la entrega real; cerrar fija el cierre de la post venta.',
  })
  @ApiOkResponse({ type: CambioEstadoObraDto })
  cambiar(@Param('idCentroCosto', ParseIntPipe) id: number, @Body() dto: CambiarEstadoObraDto, @CurrentUser('id') usuario: string) {
    return this.handler.cambiar(id, dto, usuario);
  }
}
