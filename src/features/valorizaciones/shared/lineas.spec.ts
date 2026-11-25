import { armarCuentaCorriente } from './cuenta-corriente.js';
import { imputarPagos } from './imputar-pagos.js';
import { avancePonderado, valorizarLineas } from './lineas.js';

describe('valorizarLineas', () => {
  const lineas = [
    { id: 1, monto: 800, avancePct: 100, montoAnterior: 0 },
    { id: 2, monto: 200, avancePct: 0, montoAnterior: 0 },
  ];

  it('reparte el monto de la cuota entre las líneas según lo que avanzaron; la suma es exacta', () => {
    const r = valorizarLineas(lineas, 500, 1000);
    expect(r.map((l) => l.montoPresente)).toEqual([500, 0]);
    expect(r.reduce((a, l) => a + l.montoPresente, 0)).toBe(500);
    expect(r[0]).toMatchObject({ avanceAcumulado: 100, montoAnterior: 0, montoAcumulado: 500, saldo: 300 });
  });

  it('si nada avanzó, reparte en proporción al monto de cada línea', () => {
    const r = valorizarLineas([{ id: 1, monto: 750, avancePct: 0, montoAnterior: 0 }, { id: 2, monto: 250, avancePct: null, montoAnterior: 0 }], 100, 1000);
    expect(r.map((l) => l.montoPresente)).toEqual([75, 25]);
  });

  it('el redondeo lo absorbe la última línea con parte: nunca sobra ni falta un céntimo', () => {
    const tres = [1, 2, 3].map((id) => ({ id, monto: 100, avancePct: 50, montoAnterior: 0 }));
    const r = valorizarLineas(tres, 100, 300);
    expect(r.reduce((a, l) => a + l.montoPresente, 0)).toBeCloseTo(100, 2);
  });

  it('descuenta lo valorizado antes: solo reparte según el avance nuevo', () => {
    const r = valorizarLineas([{ id: 1, monto: 1000, avancePct: 60, montoAnterior: 300 }, { id: 2, monto: 1000, avancePct: 60, montoAnterior: 600 }], 300, 2000);
    expect(r.map((l) => l.montoPresente)).toEqual([300, 0]);
    expect(r[1].montoAcumulado).toBe(600);
  });

  it('una orden sin líneas o con monto 0 no falla', () => {
    expect(valorizarLineas([], 100, 100)).toEqual([]);
    expect(valorizarLineas([{ id: 1, monto: 0, avancePct: 50, montoAnterior: 0 }], 100, 0)[0].montoPresente).toBe(0);
  });

  it('un avance fuera de 0-100 se acota; el manual queda marcado', () => {
    const r = valorizarLineas([{ id: 1, monto: 100, avancePct: 140, manual: true, montoAnterior: 0 }], 50, 100);
    expect(r[0]).toMatchObject({ avanceAcumulado: 100, avanceManual: true });
  });
});

describe('avancePonderado', () => {
  it('pondera por el monto de cada línea; sin ningún dato es null', () => {
    expect(avancePonderado([{ monto: 800, avancePct: 100 }, { monto: 800, avancePct: 0 }])).toBe(50);
    expect(avancePonderado([{ monto: 100, avancePct: null }])).toBeNull();
    expect(avancePonderado([])).toBeNull();
  });

  it('una línea sin dato cuenta como 0 si otra sí lo tiene', () => {
    expect(avancePonderado([{ monto: 500, avancePct: 80 }, { monto: 500, avancePct: null }])).toBe(40);
  });
});

describe('imputarPagos', () => {
  const cuotas = [{ id: 10, numero: 0, neto: 100 }, { id: 11, numero: 1, neto: 200 }];

  it('un pago ligado a una cuota va a ella', () => {
    const r = imputarPagos(cuotas, [{ monto: 100, idValorizacion: 10 }, { monto: 50, idValorizacion: 11 }]);
    expect(r.cuotas.map((c) => [c.id, c.pagado, c.saldo, c.estado])).toEqual([[10, 100, 0, 'PAGADA'], [11, 50, 150, 'PARCIAL']]);
    expect(r.sobrante).toBe(0);
  });

  it('los pagos sin vínculo cubren las cuotas en orden', () => {
    const r = imputarPagos(cuotas, [{ monto: 130, idValorizacion: null }]);
    expect(r.cuotas.map((c) => [c.pagado, c.estado])).toEqual([[100, 'PAGADA'], [30, 'PARCIAL']]);
  });

  it('un pago de más queda como sobrante y sin pagos todo está sin pagar', () => {
    expect(imputarPagos(cuotas, [{ monto: 500, idValorizacion: null }]).sobrante).toBe(200);
    expect(imputarPagos(cuotas, []).cuotas.every((c) => c.estado === 'SIN_PAGAR')).toBe(true);
  });

  it('un pago ligado a una cuota desconocida se trata como libre', () => {
    expect(imputarPagos(cuotas, [{ monto: 40, idValorizacion: 999 }]).cuotas[0].pagado).toBe(40);
  });
});

describe('armarCuentaCorriente', () => {
  it('devenga cada cuota, abona cada pago y lleva la garantía aparte', () => {
    const c = armarCuentaCorriente([
      { fecha: '2026-11-09', tipo: 'PAGO', descripcion: 'CP-1', pagado: 15 },
      { fecha: '2026-11-02', tipo: 'CUOTA', descripcion: 'Adelanto', devengado: 15 },
      { fecha: '2026-11-09', tipo: 'CUOTA', descripcion: 'V1', devengado: 25 },
      { fecha: '2026-11-09', tipo: 'GARANTIA_RETENIDA', descripcion: 'V1', garantia: 3.33 },
    ]);
    expect(c.filas.map((f) => f.descripcion)).toEqual(['Adelanto', 'V1', 'V1', 'CP-1']);
    expect(c).toMatchObject({ devengado: 40, pagado: 15, saldo: 25, garantiaRetenida: 3.33 });
    expect(c.filas.at(-1)).toMatchObject({ saldo: 25 });
  });

  it('la devolución de la garantía baja lo retenido y devenga lo devuelto', () => {
    const c = armarCuentaCorriente([
      { fecha: '2026-11-09', tipo: 'GARANTIA_RETENIDA', descripcion: 'V1', garantia: 10 },
      { fecha: '2027-02-09', tipo: 'GARANTIA_DEVUELTA', descripcion: 'Devolución', garantia: 10, devengado: 10 },
    ]);
    expect(c).toMatchObject({ garantiaRetenida: 0, devengado: 10, saldo: 10 });
  });

  it('sin movimientos todo es cero', () => {
    expect(armarCuentaCorriente([])).toMatchObject({ filas: [], devengado: 0, pagado: 0, saldo: 0, garantiaRetenida: 0 });
  });
});
