import { resolverCobertura, type CoberturaItem } from './cobertura-origen.js';

const cob = (cantidad: number, proveedores: number[] = [7]): CoberturaItem => ({ cantidad, proveedores, documentos: ['OC-000001'] });

describe('compromisos / cobertura por la cadena de versiones', () => {
  it('un ítem que ninguna versión anterior pidió se pide completo', () => {
    expect(resolverCobertura(10, 7, undefined)).toEqual({ tipo: 'LIBRE' });
    expect(resolverCobertura(10, 7, cob(0))).toEqual({ tipo: 'LIBRE' });
  });

  it('mismo proveedor y misma cantidad: ya está pedido, no se genera nada', () => {
    expect(resolverCobertura(10, 7, cob(10))).toEqual({ tipo: 'CUBIERTO' });
  });

  it('mismo proveedor y menos cantidad que antes: sigue cubierto', () => {
    expect(resolverCobertura(6, 7, cob(10))).toEqual({ tipo: 'CUBIERTO' });
  });

  it('mismo proveedor y más cantidad: se pide solo la diferencia', () => {
    expect(resolverCobertura(12, 7, cob(10))).toEqual({ tipo: 'DIFERENCIA', cantidad: 2 });
  });

  it('otro proveedor: conflicto (hay que anular la orden anterior o volver al mismo proveedor)', () => {
    expect(resolverCobertura(10, 8, cob(10))).toEqual({ tipo: 'CONFLICTO' });
    expect(resolverCobertura(15, 8, cob(10))).toEqual({ tipo: 'CONFLICTO' });
  });

  it('pedido a dos proveedores distintos por versiones anteriores: conflicto aunque uno coincida', () => {
    expect(resolverCobertura(10, 7, cob(10, [7, 8]))).toEqual({ tipo: 'CONFLICTO' });
  });

  it('la diferencia de redondeo de centésimas no genera un pedido', () => {
    expect(resolverCobertura(10.004, 7, cob(10))).toEqual({ tipo: 'CUBIERTO' });
  });
});
