import { Test } from '@nestjs/testing';
import { MenuController } from './menu.controller.js';
import { MenuHandler } from './menu.handler.js';

describe('menu', () => {
  let controller: MenuController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MenuController],
      providers: [MenuHandler],
    }).compile();

    controller = moduleRef.get(MenuController);
  });

  it('devuelve el menú completo cuando no se envía rol', () => {
    const menu = controller.getByRole({});
    expect(menu).toHaveLength(1);
    expect(menu[0].items.map((i) => i.key)).toEqual([
      'tipo-categoria',
      'categoria',
      'unidad-medida',
      'producto',
    ]);
  });

  it('devuelve todos los items para el rol ADMIN', () => {
    const menu = controller.getByRole({ rol: 'ADMIN' });
    expect(menu).toHaveLength(1);
    expect(menu[0].items.map((i) => i.key)).toEqual([
      'tipo-categoria',
      'categoria',
      'unidad-medida',
      'producto',
    ]);
  });

  it('devuelve solo los items permitidos para el rol VENTAS', () => {
    const menu = controller.getByRole({ rol: 'VENTAS' });
    expect(menu).toHaveLength(1);
    expect(menu[0].items.map((i) => i.key)).toEqual(['producto']);
  });

  it('oculta una sección sin items visibles para el rol', () => {
    const menu = controller.getByRole({ rol: 'COMPRAS' });
    expect(menu).toEqual([]);
  });

  it('la respuesta no expone los roles', () => {
    const menu = controller.getByRole({});
    expect(menu[0]).not.toHaveProperty('roles');
    expect(menu[0].items[0]).not.toHaveProperty('roles');
  });
});