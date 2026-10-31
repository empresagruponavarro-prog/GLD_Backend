import { buscarPersona } from './buscar-persona.js';

const personas = [
  { id: 1, nombre: 'Melissa García Ríos' },
  { id: 2, nombre: 'Abel Narváez' },
  { id: 3, nombre: 'Carlos Gómez' },
  { id: 4, nombre: 'Carlos Guerra' },
  { id: 5, nombre: 'Marifá Soto' },
];

describe('buscarPersona (equipo del Excel → maestro de trabajadores)', () => {
  it('nombre exacto, sin importar tildes ni mayúsculas', () => {
    expect(buscarPersona('abel narvaez', personas)).toEqual({ persona: personas[1] });
  });

  it('«Melissa G.» encuentra a Melissa García', () => {
    expect(buscarPersona('Melissa G.', personas)).toEqual({ persona: personas[0] });
  });

  it('«Carlos G.» es ambiguo (Gómez y Guerra): no se asigna a nadie', () => {
    const r = buscarPersona('Carlos G.', personas);
    expect(r.persona).toBeNull();
    expect(r).toMatchObject({ motivo: 'ambiguo', candidatos: ['Carlos Gómez', 'Carlos Guerra'] });
  });

  it('un apellido más aclara el caso', () => {
    expect(buscarPersona('Carlos Gu', personas)).toEqual({ persona: personas[3] });
  });

  it('sin coincidencia o vacío', () => {
    expect(buscarPersona('Zoila Nueva', personas)).toMatchObject({ persona: null, motivo: 'sin-coincidencia' });
    expect(buscarPersona('  ', personas)).toMatchObject({ persona: null, motivo: 'vacio' });
  });
});
