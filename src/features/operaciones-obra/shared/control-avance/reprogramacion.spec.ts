import { aDia, deDia } from './calendario.js';
import { diasPausa, esMotivoExterno, finControl, finVigente, pactadoControl, pausaVigente, resumenReprogramacion, soloExternas, type Pausa } from './reprogramacion.js';
import { metasPorDefecto, pactadoAcumulado } from './metas.js';

const d = aDia;
const cliente7: Pausa = { desde: d('2026-10-15'), dias: 7, externa: true };
const interna5: Pausa = { desde: d('2026-10-20'), dias: 5, externa: false };

describe('reprogramación · causa externa o interna', () => {
  it('solo INTERNO cuenta como atraso', () => {
    expect(esMotivoExterno('CLIENTE')).toBe(true);
    expect(esMotivoExterno('PERMISO_LICENCIA')).toBe(true);
    expect(esMotivoExterno('PROVEEDOR_CLIENTE')).toBe(true);
    expect(esMotivoExterno('FUERZA_MAYOR')).toBe(true);
    expect(esMotivoExterno('INTERNO')).toBe(false);
  });

  it('soloExternas', () => {
    expect(soloExternas([cliente7, interna5])).toEqual([cliente7]);
  });
});

describe('reprogramación · RC-09 fin vigente y fin de control', () => {
  it('ejemplo de la documentación: fin 26/10 + 7 días por Cliente = 02/11 (vigente y de control)', () => {
    const fin = d('2026-10-26');
    expect(deDia(finVigente(fin, [cliente7]))).toBe('2026-11-02');
    expect(deDia(finControl(fin, [cliente7]))).toBe('2026-11-02');
  });

  it('una causa interna alarga el fin vigente pero NO el de control', () => {
    const fin = d('2026-10-26');
    expect(deDia(finVigente(fin, [cliente7, interna5]))).toBe('2026-11-07');
    expect(deDia(finControl(fin, [cliente7, interna5]))).toBe('2026-11-02');
  });

  it('sin reprogramaciones nada cambia', () => {
    const fin = d('2026-10-26');
    expect(finVigente(fin, [])).toBe(fin);
    expect(finControl(fin, [])).toBe(fin);
  });

  it('resumen: total, externos e internos', () => {
    expect(resumenReprogramacion([cliente7, interna5])).toEqual({ diasReprogramados: 12, diasExternos: 7, diasInternos: 5 });
    expect(resumenReprogramacion([])).toEqual({ diasReprogramados: 0, diasExternos: 0, diasInternos: 0 });
  });
});

describe('reprogramación · diasPausa', () => {
  it('cuenta los días transcurridos de la pausa, con tope en sus días', () => {
    expect(diasPausa([cliente7], d('2026-10-14'))).toBe(0);
    expect(diasPausa([cliente7], d('2026-10-15'))).toBe(1);
    expect(diasPausa([cliente7], d('2026-10-21'))).toBe(7);
    expect(diasPausa([cliente7], d('2026-12-31'))).toBe(7);
  });

  it('suma varias pausas, incluso superpuestas', () => {
    const solapada: Pausa = { desde: d('2026-10-17'), dias: 3, externa: true };
    expect(diasPausa([cliente7, solapada], d('2026-10-19'))).toBe(5 + 3);
  });
});

describe('reprogramación · pausa vigente', () => {
  it('el día de inicio y el último día están dentro; el siguiente, fuera', () => {
    expect(pausaVigente([cliente7], d('2026-10-15'))).toBe(cliente7);
    expect(pausaVigente([cliente7], d('2026-10-21'))).toBe(cliente7);
    expect(pausaVigente([cliente7], d('2026-10-22'))).toBeNull();
    expect(pausaVigente([cliente7], d('2026-10-14'))).toBeNull();
  });
});

describe('reprogramación · pactado de control', () => {
  // Subpartida lun 12/10 – sáb 17/10 (6 días laborables), semana 5 de una obra con W1 = 14/09.
  const w1 = d('2026-09-14');
  const sub = { inicio: d('2026-10-12'), fin: d('2026-10-17') };
  const metas = metasPorDefecto(sub, w1);
  const pausaExterna: Pausa = { desde: d('2026-10-12'), dias: 7, externa: true };

  it('sin pausas coincide con el pactado normal', () => {
    expect(pactadoControl(sub, metas, w1, d('2026-10-17'), [])).toBeCloseTo(pactadoAcumulado(sub, metas, w1, d('2026-10-17')), 9);
    expect(pactadoAcumulado(sub, metas, w1, d('2026-10-17'))).toBeCloseTo(100, 6);
  });

  it('una pausa externa corre el plan: el mismo día pide menos avance', () => {
    expect(pactadoControl(sub, metas, w1, d('2026-10-17'), [pausaExterna])).toBeCloseTo(0, 6);
  });

  it('terminada la pausa el plan se retoma y llega a 100', () => {
    expect(pactadoControl(sub, metas, w1, d('2026-10-25'), [pausaExterna])).toBeCloseTo(100, 6);
  });

  it('una pausa interna no corre el plan (se pasa solo las externas)', () => {
    const externas = soloExternas([{ desde: d('2026-10-12'), dias: 7, externa: false }]);
    expect(pactadoControl(sub, metas, w1, d('2026-10-17'), externas)).toBeCloseTo(100, 6);
  });
});
