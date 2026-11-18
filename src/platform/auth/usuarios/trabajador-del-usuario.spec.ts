import { ConflictException } from '@nestjs/common';
import { exigirTrabajadorVinculado } from './trabajador-del-usuario.js';

describe('usuario / trabajador vinculado (plan 09)', () => {
  it('devuelve el trabajador si el usuario lo tiene', () => {
    expect(exigirTrabajadorVinculado(12, 'jperez')).toBe(12);
  });

  it('sin trabajador: 409 que nombra al usuario y dice dónde se asigna', () => {
    expect(() => exigirTrabajadorVinculado(null, 'jperez')).toThrow(ConflictException);
    expect(() => exigirTrabajadorVinculado(undefined, 'jperez')).toThrow(/jperez.*Administración › Usuarios/);
  });
});
