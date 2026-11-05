import { finPorSemanas, obraIniciada, resolverPlazo, semanasPorPlazo, type Plazo } from './plazo-obra.js';

describe('finPorSemanas / semanasPorPlazo', () => {
  it('N semanas desde el inicio terminan 7·N − 1 días después', () => {
    expect(finPorSemanas('2026-10-05', 1)).toBe('2026-10-11');
    expect(finPorSemanas('2026-10-05', 6)).toBe('2026-11-15');
    expect(finPorSemanas('2026-10-02', 12)).toBe('2026-12-24');
  });

  it('las semanas que cubre un plazo se redondean hacia arriba y son al menos una', () => {
    expect(semanasPorPlazo('2026-10-05', '2026-10-11')).toBe(1);
    expect(semanasPorPlazo('2026-10-05', '2026-10-12')).toBe(2);
    expect(semanasPorPlazo('2026-10-05', '2026-10-05')).toBe(1);
  });

  it('son inversas para plazos de semanas completas', () => {
    for (const n of [1, 4, 10, 13]) expect(semanasPorPlazo('2026-09-23', finPorSemanas('2026-09-23', n))).toBe(n);
  });
});

describe('resolverPlazo (S-02, S-05)', () => {
  const base: Plazo = { inicio: '2026-10-05', fin: '2026-11-15', semanas: 6 };

  it('sin cambios deja todo igual', () => {
    expect(resolverPlazo(base, {})).toEqual({ plazo: base });
    expect(resolverPlazo(base, { inicio: base.inicio!, fin: base.fin!, semanas: 6 })).toEqual({ plazo: base });
  });

  it('cambiar las semanas recalcula el fin', () => {
    expect(resolverPlazo(base, { semanas: 8 }).plazo).toEqual({ inicio: '2026-10-05', fin: '2026-11-29', semanas: 8 });
  });

  it('cambiar el fin recalcula las semanas', () => {
    expect(resolverPlazo(base, { fin: '2026-12-06' }).plazo).toEqual({ inicio: '2026-10-05', fin: '2026-12-06', semanas: 9 });
  });

  it('cambiar solo el inicio corre el fin los mismos días y conserva la duración', () => {
    expect(resolverPlazo(base, { inicio: '2026-10-12' }).plazo).toEqual({ inicio: '2026-10-12', fin: '2026-11-22', semanas: 6 });
    expect(resolverPlazo(base, { inicio: '2026-10-01' }).plazo).toEqual({ inicio: '2026-10-01', fin: '2026-11-11', semanas: 6 });
  });

  it('inicio y semanas a la vez: el fin sale de las semanas desde el inicio nuevo', () => {
    expect(resolverPlazo(base, { inicio: '2026-10-12', semanas: 2 }).plazo).toEqual({ inicio: '2026-10-12', fin: '2026-10-25', semanas: 2 });
  });

  it('fin y semanas a la vez solo valen si coinciden', () => {
    expect(resolverPlazo(base, { semanas: 8, fin: '2026-11-29' }).error).toBeUndefined();
    const incoherente = resolverPlazo(base, { semanas: 8, fin: '2026-12-31' });
    expect(incoherente.error).toMatch(/no coincide con 8 semana/);
    expect(incoherente.plazo.fin).toBe('2026-12-31'); // no inventa un valor
  });

  it('una obra sin plazo todavía: lo que se pide se guarda tal cual', () => {
    const vacio: Plazo = { inicio: null, fin: null, semanas: null };
    expect(resolverPlazo(vacio, { inicio: '2026-10-05' }).plazo).toEqual({ inicio: '2026-10-05', fin: null, semanas: null });
    expect(resolverPlazo(vacio, { inicio: '2026-10-05', semanas: 4 }).plazo).toEqual({ inicio: '2026-10-05', fin: '2026-11-01', semanas: 4 });
    expect(resolverPlazo(vacio, { semanas: 4 }).plazo).toEqual({ inicio: null, fin: null, semanas: 4 });
  });
});

describe('obraIniciada (S-05)', () => {
  it('en ejecución, entregada o culminada ya inició', () => {
    expect(obraIniciada('EN_EJECUCION', false)).toBe(true);
    expect(obraIniciada('POST_VENTA', false)).toBe(true);
    expect(obraIniciada('CULMINADO', false)).toBe(true);
  });

  it('con avance registrado ya inició, sea cual sea su estado', () => {
    expect(obraIniciada('PROXIMO', true)).toBe(true);
    expect(obraIniciada(null, true)).toBe(true);
  });

  it('sin estado, próxima o suspendida sin avance todavía no inició', () => {
    expect(obraIniciada(null, false)).toBe(false);
    expect(obraIniciada('PROXIMO', false)).toBe(false);
    expect(obraIniciada('SUSPENDIDA', false)).toBe(false);
    expect(obraIniciada('CANCELADA', false)).toBe(false);
  });
});
