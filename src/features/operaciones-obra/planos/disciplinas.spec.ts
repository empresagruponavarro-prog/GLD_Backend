import { disciplinasDistintas, normalizarDisciplina, prefijoDisciplina } from './disciplinas.js';

describe('disciplinas de plano (columna «Disciplina» de los tipos de plano)', () => {
  it('las conocidas conservan su prefijo de siempre, con o sin tildes', () => {
    expect(prefijoDisciplina('ARQUITECTURA')).toBe('ARQ');
    expect(prefijoDisciplina('Estructuras')).toBe('EST');
    expect(prefijoDisciplina('INSTALACIONES ELÉCTRICAS')).toBe('IE');
    expect(prefijoDisciplina('instalaciones electricas')).toBe('IE');
    expect(prefijoDisciplina('INSTALACIONES SANITARIAS')).toBe('IS');
    expect(prefijoDisciplina('INSTALACIONES MECÁNICAS')).toBe('MEC');
    expect(prefijoDisciplina('COMUNICACIONES')).toBe('COM');
    expect(prefijoDisciplina('OTROS')).toBe('PLN');
  });

  it('una disciplina nueva usa sus 3 primeras letras', () => {
    expect(prefijoDisciplina('GAS')).toBe('GAS');
    expect(prefijoDisciplina('DETALLES CONSTRUCTIVOS')).toBe('DET');
    expect(prefijoDisciplina('Ñ')).toBe('N');
    expect(prefijoDisciplina('123')).toBe('PLN');
  });

  it('se guardan en mayúsculas y sin espacios sobrantes', () => {
    expect(normalizarDisciplina('  instalaciones   eléctricas ')).toBe('INSTALACIONES ELÉCTRICAS');
  });

  it('cada disciplina aparece una sola vez, en el orden del catálogo, sin vacías', () => {
    expect(disciplinasDistintas(['ARQUITECTURA', 'arquitectura', null, ' ', 'ESTRUCTURAS', 'ARQUITECTURA', 'GAS'])).toEqual([
      { nombre: 'ARQUITECTURA', prefijo: 'ARQ' },
      { nombre: 'ESTRUCTURAS', prefijo: 'EST' },
      { nombre: 'GAS', prefijo: 'GAS' },
    ]);
  });
});
