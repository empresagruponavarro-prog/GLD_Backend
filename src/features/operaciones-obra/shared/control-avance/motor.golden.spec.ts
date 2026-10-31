import { readFileSync } from 'node:fs';
import { aDia, diasLaborables } from './calendario.js';
import { truncar } from './avance.js';
import type { ObraEntrada } from './control-avance.types.js';
import { metasPorDefecto } from './metas.js';
import { calcularObra } from './motor.js';

/**
 * Golden tests: el motor debe dar lo mismo que el Excel de Operaciones. Los fixtures
 * (`__fixtures__/`) se extrajeron de OP-26-017 y OP-26-020: entradas = celdas que llena la gente;
 * `esperado` = valores que Excel calculó al guardar el archivo (columnas AG, AH, AI, AJ, AK, BC,
 * resumen de la Ficha y hoja Curva S). `hoy` = 19/10/2026, el lunes de la semana en que se guardaron.
 */

interface SubFixture {
  item: string;
  nombre: string;
  tipo: string | null;
  inicio: string;
  fin: string;
  metas: (number | null)[];
  avance: (number | null)[];
  esperado: { diasLab: number; programado: number | null; real: number | null; desviacion: number | null; situacion: string; revision: string; peso: number };
}
interface Fixture {
  hoySugerido: string;
  ficha: { inicio: string; fin: string; estado: string; avanceGeneral: number | null };
  reprogramaciones: unknown[];
  partidas: { item: string; nombre: string; tipo: string | null; subpartidas: SubFixture[] }[];
  esperadoObra: {
    realPct: number;
    programadoPct: number;
    situacion: string;
    semanaEnCurso: number;
    corte: string;
    finOriginal: string;
    finVigente: string;
    diasReprogramados: number;
  };
  esperadoCurvaS: { semana: string; pactadoAcum: number | null; realAcum: number | null }[];
}

const cargar = (nombre: string): Fixture =>
  JSON.parse(readFileSync(new URL(`./__fixtures__/${nombre}`, import.meta.url), 'utf8')) as Fixture;

function aEntrada(f: Fixture): ObraEntrada {
  return {
    estado: 'EN_EJECUCION',
    inicio: f.ficha.inicio,
    fin: f.ficha.fin,
    avanceGeneral: f.ficha.avanceGeneral,
    reprogramaciones: [],
    partidas: f.partidas.map((p) => ({
      item: p.item,
      nombre: p.nombre,
      subpartidas: p.subpartidas.map((s) => ({ item: s.item, nombre: s.nombre, inicio: s.inicio, fin: s.fin, metas: s.metas, avance: s.avance })),
    })),
  };
}

describe.each([
  ['op-26-017.json', 'OP-26-017 Tambo Pacasmayo Callao'],
  ['op-26-020.json', 'OP-26-020 Tambo Samame Surco'],
])('golden · %s (%s)', (archivo) => {
  const f = cargar(archivo);
  const hoy = f.hoySugerido;
  const res = calcularObra(aEntrada(f), hoy);
  const subsFixture = f.partidas.flatMap((p) => p.subpartidas);
  const subsMotor = res.partidas.flatMap((p) => p.subpartidas);

  it('el fixture es el del lunes 19/10/2026 y tiene 33 subpartidas con Revisión OK', () => {
    expect(hoy).toBe('2026-10-19');
    expect(subsFixture).toHaveLength(33);
    expect(subsMotor).toHaveLength(33);
    expect(subsFixture.every((s) => s.esperado.revision === 'OK')).toBe(true);
  });

  it('RC-02/RC-03 · días laborables y peso de cada subpartida', () => {
    subsFixture.forEach((s, i) => {
      expect(subsMotor[i].diasLaborables, s.item).toBe(s.esperado.diasLab);
      expect(subsMotor[i].peso, s.item).toBe(s.esperado.peso);
      expect(diasLaborables(aDia(s.inicio), aDia(s.fin)), s.item).toBe(s.esperado.diasLab);
    });
  });

  it('RC-04 · el reparto automático reproduce las metas que calculó el Excel (± 0,1)', () => {
    const w1 = aDia(f.ficha.inicio) - ((((aDia(f.ficha.inicio) + 4) % 7) + 6) % 7);
    subsFixture.forEach((s) => {
      const auto = metasPorDefecto({ inicio: aDia(s.inicio), fin: aDia(s.fin) }, w1);
      auto.forEach((m, k) => expect(m, `${s.item} sem ${k + 1}`).toBeCloseTo(s.metas[k] ?? 0, 0));
    });
  });

  it('RC-05/RC-08 · % programado al cierre de la semana anterior de cada subpartida', () => {
    subsFixture.forEach((s, i) => {
      expect(subsMotor[i].programado, s.item).toBeCloseTo(s.esperado.programado ?? 0, 1);
    });
  });

  it('RC-06 · % real acumulado de cada subpartida', () => {
    subsFixture.forEach((s, i) => {
      expect(subsMotor[i].real, s.item).toBeCloseTo(s.esperado.real ?? 0, 1);
    });
  });

  it('RC-11 · desviación de cada subpartida', () => {
    subsFixture.forEach((s, i) => {
      if (s.esperado.desviacion !== null) expect(subsMotor[i].desviacion, s.item).toBeCloseTo(s.esperado.desviacion, 1);
    });
  });

  it('RC-12 · situación de cada subpartida', () => {
    subsFixture.forEach((s, i) => {
      expect(subsMotor[i].situacion.texto, s.item).toBe(s.esperado.situacion);
    });
  });

  it('RC-10 · avance real y programado de la obra (Ficha C26 y C27)', () => {
    expect(truncar(res.real)).toBe(f.esperadoObra.realPct);
    expect(truncar(res.programado)).toBe(f.esperadoObra.programadoPct);
  });

  it('RC-12 · situación de la obra (Ficha C28)', () => {
    expect(res.situacion.texto).toBe(f.esperadoObra.situacion);
  });

  it('RC-07/RC-17 · semana en curso y corte', () => {
    expect(res.semana.actual).toBe(f.esperadoObra.semanaEnCurso);
    expect(res.corte).toBe(f.esperadoObra.corte);
    expect(res.semana.texto).toMatch(new RegExp(`^Sem ${f.esperadoObra.semanaEnCurso} de \\d+$`));
  });

  it('RC-09 · sin reprogramaciones el fin vigente es el original', () => {
    expect(res.plazos.finOriginal).toBe(f.esperadoObra.finOriginal);
    expect(res.plazos.finVigente).toBe(f.esperadoObra.finVigente);
    expect(res.plazos.diasReprogramados).toBe(f.esperadoObra.diasReprogramados);
    expect(res.plazos.enPausa).toBe(false);
  });

  it('RC-22 · Curva S: pactado y real acumulados por semana', () => {
    const curva = res.curvaS;
    expect(curva).not.toBeNull();
    expect(curva!.semanas).toHaveLength(f.esperadoCurvaS.length);
    f.esperadoCurvaS.forEach((e, i) => {
      const p = curva!.semanas[i];
      expect(p.pactado, e.semana).toBeCloseTo(e.pactadoAcum ?? 0, 0);
      if (e.realAcum === null) expect(p.real, e.semana).toBeNull();
      else expect(p.real, e.semana).toBeCloseTo(e.realAcum, 0);
    });
  });

  it('una obra sin reprogramaciones ni atraso no tiene días fuera de plazo ni de retraso', () => {
    expect(res.plazos.diasFueraDePlazo).toBe(0);
    expect(res.plazos.diasRetraso).toBe(0);
  });

  it('RC-16 · el fin cae a una semana: es «próximo a vencer»', () => {
    // fin 22/10 (017) y 26/10 (020): ambos a ≤ 7 días de hoy
    expect(res.plazos.proximoAVencer).toBe(true);
  });

  it('las filas del Excel con Revisión OK no generan avisos de carga', () => {
    expect(res.avisos).toEqual([]);
  });
});
