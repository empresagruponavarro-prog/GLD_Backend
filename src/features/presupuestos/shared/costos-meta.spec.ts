import {
  aplicarPorcentaje,
  diferenciaMeta,
  esPuMetaValido,
  metaDeHijos,
  metaSubfase,
  planificarAjuste,
  porcentajeSobreBase,
  puMetaEfectivo,
  sumarImportes,
  totalMetaItem,
} from './costos-meta.js';

describe('costos del Presupuesto Meta', () => {
  describe('aplicarPorcentaje', () => {
    it('sube el Base: S/ 1 000 con +50 % queda en S/ 1 500', () => {
      expect(aplicarPorcentaje(1000, 50)).toBe(1500);
    });

    it('baja el Base y absorbe el error de coma flotante (350 × 0,9 = 315,00000000000006)', () => {
      expect(aplicarPorcentaje(350, -10)).toBe(315);
    });

    it('redondea a 2 decimales', () => {
      expect(aplicarPorcentaje(10, 33.33)).toBe(13.33);
      expect(aplicarPorcentaje(0.5, 10)).toBe(0.55);
    });

    it('0 % deja el precio igual', () => {
      expect(aplicarPorcentaje(123.45, 0)).toBe(123.45);
    });
  });

  describe('porcentajeSobreBase', () => {
    it('es la inversa de aplicarPorcentaje: escribir S/ 1 200 sobre un Base de S/ 1 000 muestra 20 %', () => {
      expect(porcentajeSobreBase(1000, 1200)).toBe(20);
      expect(porcentajeSobreBase(1000, 1500)).toBe(50);
    });

    it('es negativo cuando el Meta es más barato', () => {
      expect(porcentajeSobreBase(1000, 900)).toBe(-10);
    });

    it('es null si el Base es 0 o negativo', () => {
      expect(porcentajeSobreBase(0, 100)).toBeNull();
      expect(porcentajeSobreBase(-5, 100)).toBeNull();
    });
  });

  describe('puMetaEfectivo', () => {
    it('sin precio Meta propio (null o undefined) vale el Base', () => {
      expect(puMetaEfectivo(80, null)).toBe(80);
      expect(puMetaEfectivo(80, undefined)).toBe(80);
    });

    it('con precio Meta propio vale ese, sea mayor o menor al Base', () => {
      expect(puMetaEfectivo(80, 95)).toBe(95);
      expect(puMetaEfectivo(80, 60)).toBe(60);
    });
  });

  describe('totalMetaItem', () => {
    it('sin Meta propio es cantidad × Base', () => {
      expect(totalMetaItem(12.5, 350, null)).toBe(4375);
    });

    it('con Meta propio es cantidad × Meta', () => {
      expect(totalMetaItem(12.5, 350, 315)).toBe(3937.5);
    });

    it('redondea el precio a 2 decimales antes de multiplicar (10,126 → 10,13; × 3 = 30,39)', () => {
      expect(totalMetaItem(3, 10.126, null)).toBe(30.39);
      expect(totalMetaItem(3, 99, 10.126)).toBe(30.39);
    });

    it('cantidad 0 da total 0', () => {
      expect(totalMetaItem(0, 100, 150)).toBe(0);
    });
  });

  describe('metaSubfase', () => {
    it('con ítems es la suma de su Meta, ignorando el monto a mano y el Base', () => {
      expect(metaSubfase({ itemsTotalMeta: [3937.5, 100.25], metaManual: 999, base: 4475.25 })).toBe(4037.75);
    });

    it('sin ítems usa el monto Meta escrito a mano', () => {
      expect(metaSubfase({ itemsTotalMeta: [], metaManual: 900, base: 1000 })).toBe(900);
    });

    it('sin ítems y sin monto a mano vale el Base', () => {
      expect(metaSubfase({ itemsTotalMeta: [], metaManual: null, base: 1000 })).toBe(1000);
      expect(metaSubfase({ itemsTotalMeta: [], metaManual: undefined, base: 1000 })).toBe(1000);
    });

    it('un monto a mano de 0 es un monto (no cae al Base)', () => {
      expect(metaSubfase({ itemsTotalMeta: [], metaManual: 0, base: 1000 })).toBe(0);
    });
  });

  describe('metaDeHijos (fase y presupuesto)', () => {
    it('con hijos es la suma de su Meta efectivo', () => {
      expect(metaDeHijos([1000.1, 2000.2], 9999)).toBe(3000.3);
    });

    it('sin hijos vale el Base', () => {
      expect(metaDeHijos([], 1500)).toBe(1500);
    });
  });

  describe('importes', () => {
    it('sumarImportes suma a 2 decimales y no arrastra el error de coma flotante', () => {
      expect(sumarImportes([0.1, 0.2])).toBe(0.3);
    });

    it('sumarImportes ignora lo que no es un número finito', () => {
      expect(sumarImportes([10, Number.NaN, Number.POSITIVE_INFINITY, 5])).toBe(15);
    });

    it('diferenciaMeta es Meta − Base (negativa = más barato)', () => {
      expect(diferenciaMeta(120000, 104500)).toBe(-15500);
      expect(diferenciaMeta(100, 100.4)).toBe(0.4);
    });
  });

  describe('planificarAjuste (un % para toda la subfase)', () => {
    it('le da a cada ítem su Base más el %', () => {
      const plan = planificarAjuste(
        [
          { id: 1, base: 1000, etiqueta: '1.01' },
          { id: 2, base: 350, etiqueta: '1.02' },
        ],
        -10,
      );
      expect(plan).toEqual({
        cambios: [
          { id: 1, pu: 900 },
          { id: 2, pu: 315 },
        ],
        sinPrecio: [],
        invalidos: [],
      });
    });

    it('un ítem sin precio Base queda como está y se informa; no frena a los demás', () => {
      const plan = planificarAjuste(
        [
          { id: 1, base: 100, etiqueta: '1.01' },
          { id: 2, base: 0, etiqueta: '1.02' },
        ],
        50,
      );
      expect(plan.cambios).toEqual([{ id: 1, pu: 150 }]);
      expect(plan.sinPrecio).toEqual(['1.02']);
      expect(plan.invalidos).toEqual([]);
    });

    it('un % que deja un precio por debajo de S/ 0,01 lo marca como inválido', () => {
      const plan = planificarAjuste(
        [
          { id: 1, base: 1, etiqueta: '1.01' },
          { id: 2, base: 500, etiqueta: '1.02' },
        ],
        -99.99,
      );
      expect(plan.invalidos).toEqual(['1.01']);
      expect(plan.cambios).toEqual([{ id: 2, pu: 0.05 }]);
    });

    it('sin ítems no hay nada que planificar', () => {
      expect(planificarAjuste([], 10)).toEqual({ cambios: [], sinPrecio: [], invalidos: [] });
    });
  });

  describe('esPuMetaValido', () => {
    it('exige al menos un céntimo', () => {
      expect(esPuMetaValido(0.01)).toBe(true);
      expect(esPuMetaValido(350)).toBe(true);
      expect(esPuMetaValido(0)).toBe(false);
      expect(esPuMetaValido(-1)).toBe(false);
      expect(esPuMetaValido(Number.NaN)).toBe(false);
    });

    it('un % extremo sobre un Base chico puede dejar el precio en 0: no es válido', () => {
      expect(esPuMetaValido(aplicarPorcentaje(1, -99.99))).toBe(false);
    });
  });
});
