import { Reflector } from '@nestjs/core';
import { InventarioInicialController } from './inventario-inicial.controller.js';
import type { DocumentoHandler } from './documento.handler.js';
import type { DocumentoResponseDto } from './documento.dto.js';
import { accionDeMetodo, moduloDeClase } from '../../../platform/auth/permisos.decorator.js';

const DOC = { id: 7, motivo: 'INVENTARIO_INICIAL' } as DocumentoResponseDto;

function crear() {
  const handler = {
    getById: vi.fn().mockResolvedValue(DOC),
    anular: vi.fn().mockResolvedValue(DOC),
  };
  const controller = new InventarioInicialController(handler as unknown as DocumentoHandler);
  return { handler, controller };
}

describe('InventarioInicialController', () => {
  it('GET :id obtiene solo documentos de inventario inicial', async () => {
    const { handler, controller } = crear();
    await expect(controller.getById(7)).resolves.toBe(DOC);
    expect(handler.getById).toHaveBeenCalledWith(7, 'INGRESO', 'INVENTARIO_INICIAL');
  });

  it('POST :id/anular anula solo documentos de inventario inicial', async () => {
    const { handler, controller } = crear();
    await expect(controller.anular(7)).resolves.toBe(DOC);
    expect(handler.anular).toHaveBeenCalledWith(7, 'INGRESO', 'INVENTARIO_INICIAL');
  });

  it('anular exige la acción "anular" del módulo almacen.inventario-inicial', () => {
    const reflector = new Reflector();
    expect(moduloDeClase(reflector, InventarioInicialController)).toBe('almacen.inventario-inicial');
    expect(accionDeMetodo(reflector, InventarioInicialController.prototype.anular)).toBe('anular');
    expect(accionDeMetodo(reflector, InventarioInicialController.prototype.getById)).toBeUndefined();
  });
});
