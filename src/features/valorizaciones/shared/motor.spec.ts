import casos from './__fixtures__/casos-valorizacion.json' with { type: 'json' };
import {
  ACUMULADO_VACIO,
  acumular,
  calcularAdelanto,
  calcularCuota,
  netoSinDescuentos,
  redondear2,
  repartirDeductivos,
  sugerirValorizado,
  type CondicionesCalculo,
  type CuotaCalculada,
  type MontosDocumento,
} from './cuota.js';
import { acumuladoDe, matrizDePagos, proyectarPendientes, valorizacionesRestantes, type CuotaAprobada } from './esquema.js';

/** Calcula todas las cuotas de un contrato en orden: el adelanto y cada valorización (con el monto elegido si lo hay). */
function calcularTodo(doc: MontosDocumento, c: CondicionesCalculo, elegido: readonly number[] = [], conAdelanto = c.adelantoPct > 0): CuotaCalculada[] {
  const filas: CuotaCalculada[] = [];
  let acu = ACUMULADO_VACIO;
  if (conAdelanto) {
    const a = calcularAdelanto(doc, c);
    filas.push(a);
    acu = acumular(acu, a);
  }
  for (let k = 1; k <= c.numeroValorizaciones; k++) {
    const pendiente = redondear2(doc.total - acu.valorizado);
    const restantes = c.numeroValorizaciones - k + 1;
    const v = elegido[k - 1] ?? redondear2(pendiente / restantes);
    const cuota = calcularCuota(doc, c, acu, { numero: k, valorizado: v, esUltima: k === c.numeroValorizaciones });
    filas.push(cuota);
    acu = acumular(acu, cuota);
  }
  return filas;
}

describe('cuotas de un contrato: los casos del plan 12 (§1.3)', () => {
  for (const caso of casos.casos) {
    it(`${caso.id} · ${caso.titulo}`, () => {
      const filas = calcularTodo(caso.doc, caso.condiciones, caso.valorizadoElegido);
      expect(filas).toHaveLength(caso.esperado.length);
      for (const [i, esperada] of caso.esperado.entries()) {
        const f = filas[i];
        expect({ tipo: f.tipo, numero: f.numero }).toEqual({ tipo: esperada.tipo, numero: esperada.numero });
        for (const col of ['valorizado', 'amortizacion', 'facturable', 'detraccion', 'garantia', 'neto'] as const) {
          expect(f[col], `${caso.id} cuota ${esperada.numero} · ${col}`).toBeCloseTo(esperada[col], 2);
        }
      }
    });

    it(`${caso.id} · todo cuadra: neto + garantía + tributos = total, y la garantía retenida es el % pactado`, () => {
      const filas = calcularTodo(caso.doc, caso.condiciones, caso.valorizadoElegido);
      const suma = redondear2(filas.reduce((a, f) => a + f.neto + f.garantia + f.detraccion + f.retencionIgv + f.renta4ta + f.descuentos, 0));
      expect(suma).toBeCloseTo(caso.doc.total, 2);
      expect(filas.reduce((a, f) => a + f.garantia, 0)).toBeCloseTo((caso.doc.total * caso.condiciones.garantiaPct) / 100, 2);
      expect(filas.reduce((a, f) => a + f.amortizacion, 0)).toBeCloseTo((caso.doc.total * caso.condiciones.adelantoPct) / 100, 2);
      expect(filas.reduce((a, f) => a + f.valorizado, 0)).toBeCloseTo(caso.doc.total, 2);
    });
  }

  it('E4: lo que se paga al contratista más la garantía es el neto del documento; la garantía solo posterga la deuda', () => {
    const e4 = casos.casos.find((c) => c.id === 'E4')!;
    const filas = calcularTodo(e4.doc, e4.condiciones);
    const pagado = redondear2(filas.reduce((a, f) => a + f.neto, 0));
    expect(pagado).toBeCloseTo(9440, 2);
    // neto del documento = total − detracción = 10 620; pagado + garantía = 10 620.
    expect(redondear2(pagado + e4.doc.total * 0.1)).toBeCloseTo(e4.doc.total - e4.doc.detraccion, 2);
  });
});

describe('cuotas: reglas', () => {
  const doc: MontosDocumento = { total: 1000, renta4ta: 0, detraccion: 0, detraccionSoles: 0, retencionIgv: 0 };
  const cond: CondicionesCalculo = { adelantoPct: 20, garantiaPct: 5, numeroValorizaciones: 4 };

  it('sin adelanto ni garantía, la cuota es el monto valorizado', () => {
    const filas = calcularTodo(doc, { adelantoPct: 0, garantiaPct: 0, numeroValorizaciones: 2 });
    expect(filas.map((f) => [f.tipo, f.valorizado, f.neto])).toEqual([['VALORIZACION', 500, 500], ['VALORIZACION', 500, 500]]);
  });

  it('una sola valorización (la liquidación) toma todo lo que queda tras el adelanto', () => {
    const filas = calcularTodo(doc, { adelantoPct: 20, garantiaPct: 10, numeroValorizaciones: 1 });
    expect(filas[1]).toMatchObject({ numero: 1, valorizado: 1000, amortizacion: 200, facturable: 800, garantia: 100, neto: 700 });
  });

  it('la última cuota toma todo lo pendiente aunque se pida otro monto', () => {
    const previo = acumuladoDe([calcularAdelanto(doc, cond)]);
    const ultima = calcularCuota(doc, cond, previo, { numero: 1, valorizado: 1, esUltima: true });
    expect(ultima.valorizado).toBe(1000);
  });

  it('un monto pedido por encima de lo pendiente se acota', () => {
    const c = calcularCuota(doc, cond, ACUMULADO_VACIO, { numero: 1, valorizado: 5000, esUltima: false });
    expect(c.valorizado).toBe(1000);
  });

  it('un monto negativo no valoriza nada', () => {
    expect(calcularCuota(doc, cond, ACUMULADO_VACIO, { numero: 1, valorizado: -50, esUltima: false }).valorizado).toBe(0);
  });

  it('los descuentos bajan el neto, y se reparten sin pasar de lo disponible', () => {
    const c = calcularCuota(doc, cond, ACUMULADO_VACIO, { numero: 1, valorizado: 250, esUltima: false, descuentos: 40 });
    expect(c.neto).toBe(redondear2(250 - 50 - 12.5 - 40));
    expect(netoSinDescuentos(c)).toBeCloseTo(187.5, 2);
    const r = repartirDeductivos(100, [{ id: 1, pendiente: 70 }, { id: 2, pendiente: 70 }, { id: 3, pendiente: 5 }]);
    expect(r.aplicaciones).toEqual([{ id: 1, monto: 70 }, { id: 2, monto: 30 }]);
    expect(r.total).toBe(100);
  });

  it('sin neto disponible no se aplica nada, y un deductivo en cero se ignora', () => {
    expect(repartirDeductivos(0, [{ id: 1, pendiente: 50 }]).aplicaciones).toEqual([]);
    expect(repartirDeductivos(100, [{ id: 1, pendiente: 0 }, { id: 2, pendiente: 10 }]).aplicaciones).toEqual([{ id: 2, monto: 10 }]);
  });

  it('un documento sin total no divide por cero', () => {
    const vacio: MontosDocumento = { total: 0, renta4ta: 0, detraccion: 0, detraccionSoles: 0, retencionIgv: 0 };
    const filas = calcularTodo(vacio, cond);
    expect(filas.every((f) => Number.isFinite(f.neto) && f.neto === 0)).toBe(true);
  });

  it('retención del IGV y renta 4.ª se reparten por lo facturable y cuadran con el documento', () => {
    const d: MontosDocumento = { total: 1180, renta4ta: 50, detraccion: 0, detraccionSoles: 0, retencionIgv: 35.4 };
    const filas = calcularTodo(d, { adelantoPct: 15, garantiaPct: 10, numeroValorizaciones: 3 });
    expect(redondear2(filas.reduce((a, f) => a + f.retencionIgv, 0))).toBe(35.4);
    expect(redondear2(filas.reduce((a, f) => a + f.renta4ta, 0))).toBe(50);
  });
});

describe('propiedad: sin importar los montos, todo cuadra y nada sale negativo', () => {
  // Generador determinista (mulberry32) para que una falla sea reproducible.
  const aleatorio = (semilla: number) => () => {
    semilla = (semilla + 0x6d2b79f5) | 0;
    let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  it('2 000 contratos al azar: Σ (neto + garantía + tributos + descuentos) = total, y ninguna columna es negativa', () => {
    const r = aleatorio(20261124);
    for (let i = 0; i < 2000; i++) {
      const total = redondear2(100 + r() * 99900);
      const detPct = r() < 0.4 ? 10 : 0;
      const retPct = detPct === 0 && r() < 0.4 ? 3 : 0;
      const doc: MontosDocumento = {
        total,
        renta4ta: r() < 0.2 ? redondear2(total * 0.04) : 0,
        detraccion: redondear2((total * detPct) / 100),
        detraccionSoles: Math.round((total * detPct) / 100),
        retencionIgv: redondear2((total * retPct) / 100),
      };
      const cond: CondicionesCalculo = { adelantoPct: redondear2(r() * 40), garantiaPct: redondear2(r() * 15), numeroValorizaciones: 1 + Math.floor(r() * 6) };
      // Montos elegidos al azar en las primeras cuotas (el supervisor puede poner cualquiera).
      const elegido = Array.from({ length: cond.numeroValorizaciones - 1 }, () => redondear2((total / cond.numeroValorizaciones) * (0.1 + r() * 1.8)));
      const filas = calcularTodo(doc, cond, elegido);
      const suma = filas.reduce((a, f) => a + f.neto + f.garantia + f.detraccion + f.retencionIgv + f.renta4ta + f.descuentos, 0);
      expect(Math.abs(suma - total), `caso ${i}: ${JSON.stringify({ doc, cond, elegido })}`).toBeLessThan(0.011);
      for (const f of filas) {
        for (const col of ['valorizado', 'amortizacion', 'facturable', 'detraccion', 'garantia', 'neto', 'renta4ta', 'retencionIgv'] as const) {
          expect(f[col], `caso ${i} cuota ${f.numero} ${col}: ${JSON.stringify({ doc, cond, elegido, fila: f })}`).toBeGreaterThanOrEqual(-0.011);
        }
      }
      expect(Math.abs(filas.reduce((a, f) => a + f.valorizado, 0) - total)).toBeLessThan(0.011);
    }
  });
});

describe('matriz de pagos: lo aprobado se queda y lo pendiente se reformula', () => {
  const doc: MontosDocumento = { total: 100, renta4ta: 0, detraccion: 0, detraccionSoles: 0, retencionIgv: 0 };
  const cond: CondicionesCalculo = { adelantoPct: 15, garantiaPct: 10, numeroValorizaciones: 3 };
  const aprobada = (c: CuotaCalculada, id: number): CuotaAprobada => ({ ...c, id });

  it('sin nada aprobado se proyecta el adelanto y las 3 valorizaciones', () => {
    const m = matrizDePagos({ doc, condiciones: cond, aprobadas: [], conAdelanto: true });
    expect(m.map((f) => [f.tipo, f.numero, f.situacion])).toEqual([
      ['ADELANTO', 0, 'PROYECTADA'],
      ['VALORIZACION', 1, 'PROYECTADA'],
      ['VALORIZACION', 2, 'PROYECTADA'],
      ['VALORIZACION', 3, 'PROYECTADA'],
    ]);
    expect(m[1].neto).toBeCloseTo(25, 2);
  });

  it('si la V1 se aprobó a la mitad, las dos que faltan suben (el 28 → 14 de la pizarra) y la aprobada no cambia', () => {
    const a = calcularAdelanto(doc, cond);
    const v1 = calcularCuota(doc, cond, acumular(ACUMULADO_VACIO, a), { numero: 1, valorizado: 16.67, esUltima: false });
    const m = matrizDePagos({ doc, condiciones: cond, aprobadas: [aprobada(a, 1), aprobada(v1, 2)], conAdelanto: true });
    expect(m.map((f) => f.situacion)).toEqual(['APROBADA', 'APROBADA', 'PROYECTADA', 'PROYECTADA']);
    expect(m[1]).toMatchObject({ valorizado: 16.67, facturable: 14.17 });
    expect(m[2]).toMatchObject({ numero: 2, valorizado: 41.67, neto: 31.26 });
    expect(m[3]).toMatchObject({ numero: 3, valorizado: 41.66, neto: 31.24 });
  });

  it('con todo aprobado no se proyecta nada, y no quedan valorizaciones', () => {
    const filas = calcularTodo(doc, cond);
    const aprobadas = filas.map((f, i) => aprobada(f, i + 1));
    expect(matrizDePagos({ doc, condiciones: cond, aprobadas, conAdelanto: true }).every((f) => f.situacion === 'APROBADA')).toBe(true);
    expect(valorizacionesRestantes(cond, aprobadas)).toBe(0);
  });

  it('sin adelanto no hay fila de adelanto', () => {
    const m = matrizDePagos({ doc, condiciones: { ...cond, adelantoPct: 0 }, aprobadas: [], conAdelanto: false });
    expect(m.every((f) => f.tipo === 'VALORIZACION')).toBe(true);
  });

  it('proyectarPendientes con cero restantes no devuelve filas', () => {
    expect(proyectarPendientes(doc, cond, ACUMULADO_VACIO, 1, 0)).toEqual([]);
  });
});

describe('sugerirValorizado: el plan es el máximo y el avance lo limita', () => {
  const base = { total: 100, valorizado: 0, restantes: 3 };

  it('con avance suficiente propone el plan (pendiente ÷ restantes)', () => {
    expect(sugerirValorizado({ ...base, avancePct: 100 })).toBe(33.33);
  });

  it('con la mitad del avance de lo esperado, propone lo que el avance alcanza (el 14 de la pizarra)', () => {
    expect(sugerirValorizado({ ...base, avancePct: 16.67 })).toBe(16.67);
  });

  it('descuenta lo ya valorizado: lo que faltó se recupera solo cuando el avance lo alcanza', () => {
    // V1 pagó 16.67 de un plan de 33.33. Si ahora el avance acumulado llega a 50 %, alcanza para 50 − 16.67 = 33.33, pero el plan de la V2 ya subió.
    expect(sugerirValorizado({ total: 100, valorizado: 16.67, restantes: 2, avancePct: 50 })).toBe(33.33);
    expect(sugerirValorizado({ total: 100, valorizado: 16.67, restantes: 2, avancePct: 60 })).toBe(41.67);
  });

  it('sin avance o sin dato no se propone nada; nunca negativo', () => {
    expect(sugerirValorizado({ ...base, avancePct: 0 })).toBe(0);
    expect(sugerirValorizado({ ...base, avancePct: null })).toBe(0);
    expect(sugerirValorizado({ total: 100, valorizado: 40, restantes: 2, avancePct: 30 })).toBe(0);
  });

  it('la última cuota propone todo lo pendiente', () => {
    expect(sugerirValorizado({ total: 100, valorizado: 66.67, restantes: 1, avancePct: 80 })).toBe(33.33);
  });
});
