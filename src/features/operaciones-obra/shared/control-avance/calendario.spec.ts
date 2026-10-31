import { aDia, deDia, diaSemana, diasLaborables, lunesDe, semanaDeFecha, semanaObra, textoDiaMes } from './calendario.js';

const d = aDia;

describe('calendario · fechas', () => {
  it('ida y vuelta ISO ↔ día', () => {
    expect(deDia(aDia('2026-10-19'))).toBe('2026-10-19');
    expect(deDia(aDia('2024-02-29'))).toBe('2024-02-29');
  });

  it('acepta un ISO largo y rechaza fechas imposibles', () => {
    expect(deDia(aDia('2026-10-19T05:00:00.000Z'))).toBe('2026-10-19');
    expect(() => aDia('2026-02-30')).toThrow();
    expect(() => aDia('19/10/2026')).toThrow();
  });

  it('día de la semana: 19/10/2026 es lunes y 18/10/2026 domingo', () => {
    expect(diaSemana(d('2026-10-19'))).toBe(1);
    expect(diaSemana(d('2026-10-18'))).toBe(0);
    expect(diaSemana(d('2026-10-24'))).toBe(6);
  });

  it('lunes de la semana: de lunes a domingo', () => {
    expect(deDia(lunesDe(d('2026-10-19')))).toBe('2026-10-19');
    expect(deDia(lunesDe(d('2026-10-25')))).toBe('2026-10-19');
    expect(deDia(lunesDe(d('2026-10-18')))).toBe('2026-10-12');
  });
});

describe('calendario · RC-02 días laborables (lunes a sábado)', () => {
  it('una semana completa tiene 6 días laborables', () => {
    expect(diasLaborables(d('2026-10-19'), d('2026-10-25'))).toBe(6);
  });

  it('el domingo no cuenta', () => {
    expect(diasLaborables(d('2026-10-18'), d('2026-10-18'))).toBe(0);
    expect(diasLaborables(d('2026-10-17'), d('2026-10-19'))).toBe(2);
  });

  it('rango invertido = 0', () => {
    expect(diasLaborables(d('2026-10-20'), d('2026-10-19'))).toBe(0);
  });

  it('coincide con NETWORKDAYS.INTL(…, 11) de los Excel: 23/09–26/10/2026 = 29 días', () => {
    // 34 días calendario con 5 domingos (27/09, 04/10, 11/10, 18/10, 25/10)
    expect(diasLaborables(d('2026-09-23'), d('2026-10-26'))).toBe(29);
  });

  it('cruce de año', () => {
    expect(diasLaborables(d('2026-12-28'), d('2027-01-03'))).toBe(6);
  });

  it('coincide con el conteo directo en un rango largo', () => {
    let directo = 0;
    for (let x = d('2026-01-01'); x <= d('2027-06-30'); x++) if (diaSemana(x) !== 0) directo++;
    expect(diasLaborables(d('2026-01-01'), d('2027-06-30'))).toBe(directo);
  });
});

describe('calendario · RC-01 / RC-07 semana de la obra y corte', () => {
  it('la Sem 1 es la semana del inicio; OP-26-020 (inicio mié 23/09) el lunes 19/10 va en la semana 5', () => {
    const s = semanaObra(d('2026-09-23'), d('2026-10-19'));
    expect(deDia(s.w1)).toBe('2026-09-21');
    expect(s.semanaEnCurso).toBe(5);
    expect(s.semanasCerradas).toBe(4);
    expect(deDia(s.corte)).toBe('2026-10-18');
    expect(deDia(s.cierreSemanaEnCurso)).toBe('2026-10-25');
  });

  it('el domingo todavía pertenece a la semana en curso (el corte no se mueve hasta el lunes)', () => {
    const s = semanaObra(d('2026-09-23'), d('2026-10-25'));
    expect(s.semanaEnCurso).toBe(5);
    expect(deDia(s.corte)).toBe('2026-10-18');
  });

  it('inicio un domingo: pertenece a la semana que termina ese día', () => {
    const s = semanaObra(d('2026-10-18'), d('2026-10-19'));
    expect(deDia(s.w1)).toBe('2026-10-12');
    expect(s.semanaEnCurso).toBe(2);
  });

  it('obra que aún no empieza: semana 0 y ninguna cerrada', () => {
    const s = semanaObra(d('2026-11-02'), d('2026-10-19'));
    expect(s.semanaEnCurso).toBe(0);
    expect(s.semanasCerradas).toBe(0);
  });

  it('las semanas cerradas se limitan a 16', () => {
    const s = semanaObra(d('2026-01-05'), d('2026-12-14'));
    expect(s.semanasCerradas).toBe(16);
  });

  it('semanaDeFecha', () => {
    const w1 = d('2026-09-21');
    expect(semanaDeFecha(w1, d('2026-09-21'))).toBe(1);
    expect(semanaDeFecha(w1, d('2026-09-27'))).toBe(1);
    expect(semanaDeFecha(w1, d('2026-09-28'))).toBe(2);
    expect(semanaDeFecha(w1, d('2026-09-20'))).toBe(0);
  });

  it('textoDiaMes', () => {
    expect(textoDiaMes(d('2026-10-05'))).toBe('05/10');
  });
});
