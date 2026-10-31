import { ESTADOS_OBRA } from '../shared/control-avance/control-avance.types.js';
import { esFechaIso, hoyLima } from '../shared/obra-shared.js';
import { TRANSICIONES_ESTADO } from './estado.handler.js';

describe('estado de obra · tabla de transiciones (RF-OP-20)', () => {
  it('define las salidas de cada estado, y solo con estados válidos', () => {
    expect(Object.keys(TRANSICIONES_ESTADO).sort()).toEqual([...ESTADOS_OBRA, 'NINGUNO'].sort());
    for (const destinos of Object.values(TRANSICIONES_ESTADO)) {
      for (const d of destinos) expect(ESTADOS_OBRA).toContain(d);
    }
  });

  it('ningún estado puede pasar a sí mismo', () => {
    for (const [origen, destinos] of Object.entries(TRANSICIONES_ESTADO)) expect(destinos).not.toContain(origen);
  });

  it('una obra nueva solo entra como Próximo o En ejecución', () => {
    expect([...TRANSICIONES_ESTADO.NINGUNO]).toEqual(['PROXIMO', 'EN_EJECUCION']);
  });

  it('el ciclo normal: Próximo → En ejecución → Post venta → Culminado', () => {
    expect(TRANSICIONES_ESTADO.PROXIMO).toContain('EN_EJECUCION');
    expect(TRANSICIONES_ESTADO.EN_EJECUCION).toContain('POST_VENTA');
    expect(TRANSICIONES_ESTADO.POST_VENTA).toEqual(['CULMINADO']);
  });

  it('no se entrega sin haber ejecutado, ni se cierra sin entregar', () => {
    expect(TRANSICIONES_ESTADO.PROXIMO).not.toContain('POST_VENTA');
    expect(TRANSICIONES_ESTADO.EN_EJECUCION).not.toContain('CULMINADO');
  });

  it('Culminada y Cancelada son estados finales', () => {
    expect(TRANSICIONES_ESTADO.CULMINADO).toEqual([]);
    expect(TRANSICIONES_ESTADO.CANCELADA).toEqual([]);
  });

  it('una obra suspendida puede reanudarse o cancelarse', () => {
    expect(TRANSICIONES_ESTADO.SUSPENDIDA).toEqual(expect.arrayContaining(['EN_EJECUCION', 'CANCELADA']));
  });

  it('Suspendida y Cancelada se alcanzan desde las obras vigentes', () => {
    expect(TRANSICIONES_ESTADO.PROXIMO).toEqual(expect.arrayContaining(['SUSPENDIDA', 'CANCELADA']));
    expect(TRANSICIONES_ESTADO.EN_EJECUCION).toEqual(expect.arrayContaining(['SUSPENDIDA', 'CANCELADA']));
  });
});

describe('fecha de Lima y validación de fechas', () => {
  it('hoyLima usa la zona horaria de Lima (UTC−5), no la de UTC', () => {
    // 03:00 UTC del 30/10 son las 22:00 del 29/10 en Lima
    expect(hoyLima(new Date('2026-10-30T03:00:00Z'))).toBe('2026-10-29');
    expect(hoyLima(new Date('2026-10-30T05:00:00Z'))).toBe('2026-10-30');
    expect(hoyLima(new Date('2026-10-30T18:59:00Z'))).toBe('2026-10-30');
  });

  it('esFechaIso acepta fechas reales y rechaza el resto', () => {
    expect(esFechaIso('2026-10-30')).toBe(true);
    expect(esFechaIso('2024-02-29')).toBe(true);
    expect(esFechaIso('2026-02-29')).toBe(false);
    expect(esFechaIso('2026-02-30')).toBe(false);
    expect(esFechaIso('2026-13-01')).toBe(false);
    expect(esFechaIso('30/10/2026')).toBe(false);
    expect(esFechaIso('2026-10-30T00:00:00Z')).toBe(false);
    expect(esFechaIso('')).toBe(false);
  });
});
