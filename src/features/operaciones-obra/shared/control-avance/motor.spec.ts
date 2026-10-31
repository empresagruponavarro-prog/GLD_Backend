import type { ObraEntrada, ReprogramacionEntrada, SubpartidaEntrada } from './control-avance.types.js';
import { calcularCurvaS, calcularObra, estadoEfectivo } from './motor.js';
import { aDia } from './calendario.js';

/**
 * Escenarios construidos a mano para las reglas que los fixtures de Excel no ejercitan
 * (reprogramaciones, En riesgo, pausa, adicionales, post venta, próximos, avisos).
 * Base: obra del lun 21/09/2026 al sáb 24/10/2026; «hoy» = mar 06/10/2026 → semana 3 en curso,
 * corte = dom 04/10, cierre de la semana = dom 11/10.
 */

const HOY = '2026-10-06';

const sub = (item: string, inicio: string, fin: string, extra: Partial<SubpartidaEntrada> = {}): SubpartidaEntrada => ({
  item,
  nombre: `Sub ${item}`,
  inicio,
  fin,
  ...extra,
});

/** Subpartida de 12 días laborables (21/09–03/10): metas automáticas 50 / 50. */
const A = (extra: Partial<SubpartidaEntrada> = {}) => sub('01.01', '2026-09-21', '2026-10-03', extra);

const obra = (p: Partial<ObraEntrada> = {}): ObraEntrada => ({
  estado: 'EN_EJECUCION',
  inicio: '2026-09-21',
  fin: '2026-10-24',
  reprogramaciones: [],
  partidas: [{ item: '01', nombre: 'Partida 01', subpartidas: [A()] }],
  ...p,
});

const conSubs = (subs: SubpartidaEntrada[], p: Partial<ObraEntrada> = {}) => obra({ partidas: [{ item: '01', nombre: 'Partida 01', subpartidas: subs }], ...p });
const rp = (desde: string, dias: number, motivo: ReprogramacionEntrada['motivo']): ReprogramacionEntrada => ({ desde, dias, motivo });
const codigos = (o: ObraEntrada, hoy = HOY) => calcularObra(o, hoy).avisos.map((a) => a.codigo).sort();

describe('motor · RC-12 situación de la obra', () => {
  it('al 100 % en ejecución: «Por entregar» (verde dentro del fin de control, ámbar después)', () => {
    const o = conSubs([A({ avance: [50, 50] })]);
    expect(calcularObra(o, HOY).situacion).toEqual({ clave: 'good', texto: 'Por entregar' });
    expect(calcularObra(o, '2026-10-30').situacion).toEqual({ clave: 'warn', texto: 'Por entregar' });
  });

  it('Retrasada: la semana cerrada pedía 100 % y la obra lleva 70 %', () => {
    const r = calcularObra(conSubs([A({ avance: [50, 20] })]), HOY);
    expect(r.real).toBe(70);
    expect(r.programado).toBeCloseTo(100, 6);
    expect(r.desviacion).toBeCloseTo(-30, 6);
    expect(r.situacion.texto).toBe('Retrasada');
    expect(r.partidas[0].situacion.texto).toBe('Retrasada');
    expect(r.partidas[0].subpartidas[0].situacion.texto).toBe('Retrasada');
  });

  it('En riesgo: va al día en promedio pero una subpartida está retrasada', () => {
    const larga = sub('01.01', '2026-09-21', '2026-10-31', { avance: [100] }); // adelantada
    const corta = sub('01.02', '2026-09-28', '2026-10-03', { avance: [0] }); // retrasada
    const r = calcularObra(conSubs([larga, corta]), HOY);
    const [s1, s2] = r.partidas[0].subpartidas;
    expect(s1.situacion.texto).toBe('Completada');
    expect(s2.situacion.texto).toBe('Retrasada');
    expect(r.real).toBeGreaterThan(r.programado);
    expect(r.situacion).toEqual({ clave: 'warn', texto: 'En riesgo' });
    expect(r.partidas[0].situacion.texto).toBe('En riesgo');
  });

  it('RF-OP-13 · una semana cerrada sin reporte cuenta como 0 y la obra aparece atrasada', () => {
    const o = conSubs([sub('01.01', '2026-09-21', '2026-09-26', { metas: [100] })]);
    const r = calcularObra(o, '2026-09-28'); // lunes: la semana 1 ya cerró
    expect(r.sinAvance).toBe(true);
    expect(r.real).toBe(0);
    expect(r.situacion.texto).toBe('Retrasada');
    expect(r.avisos.map((a) => a.codigo)).toContain('RV-22');
  });

  it('la semana en curso no se juzga: el mismo día, a mitad de la semana 1, está «Al día»', () => {
    const o = conSubs([sub('01.01', '2026-09-21', '2026-09-26', { metas: [100] })]);
    expect(calcularObra(o, '2026-09-23').situacion.texto).toBe('Al día · Sem 1 en curso');
  });

  it('obra suspendida o cancelada: la situación es el estado y no se evalúa atraso', () => {
    const o = conSubs([A({ avance: [10] })], { estado: 'SUSPENDIDA' });
    const r = calcularObra(o, HOY);
    expect(r.situacion.texto).toBe('Suspendida');
    expect(r.partidas[0].subpartidas[0].situacion.texto).toBe('Suspendida');
    expect(r.programado).toBe(r.real);
    expect(calcularObra({ ...o, estado: 'CANCELADA' }, HOY).situacion.texto).toBe('Cancelada');
  });

  it('próximo proyecto: inicio futuro → «Por iniciar», semana «Inicia dd/mm», sin avance', () => {
    const o = conSubs([sub('01.01', '2026-10-26', '2026-10-31')], { inicio: '2026-10-26', fin: '2026-11-14' });
    const r = calcularObra(o, HOY);
    expect(r.estadoEfectivo).toBe('PROXIMO');
    expect(r.situacion.texto).toBe('Por iniciar');
    expect(r.semana.texto).toBe('Inicia 26/10');
    expect(r.real).toBe(0);
    expect(r.programado).toBe(0);
  });

  it('RF-OP-21 · el estado se deriva de las fechas', () => {
    const inicio = aDia('2026-10-01');
    const hoy = aDia('2026-10-06');
    expect(estadoEfectivo('PROXIMO', inicio, hoy)).toBe('EN_EJECUCION');
    expect(estadoEfectivo('EN_EJECUCION', aDia('2026-10-26'), hoy)).toBe('PROXIMO');
    expect(estadoEfectivo('POST_VENTA', aDia('2026-10-26'), hoy)).toBe('POST_VENTA');
  });

  it('obra sin partidas: usa el % de avance general contra un programado lineal por días laborables', () => {
    const r = calcularObra(obra({ partidas: [], avanceGeneral: 40 }), HOY);
    expect(r.sinPartidas).toBe(true);
    expect(r.real).toBe(40);
    expect(r.programado).toBeCloseTo(40, 6); // 12 de 30 días laborables al corte
    expect(r.programadoFinSemana).toBeCloseTo(60, 6);
    expect(r.situacion.texto).toBe('Al día · Sem 3 en curso');
    expect(r.curvaS).toBeNull();
  });
});

describe('motor · RC-09 reprogramaciones', () => {
  const base = conSubs([A({ avance: [50, 20] })]);

  it('sin reprogramación: Retrasada (el plan pedía 100 % al corte)', () => {
    expect(calcularObra(base, HOY).situacion.texto).toBe('Retrasada');
  });

  it('causa externa: el plan se corre, el fin vigente y el de control suben y la obra queda «Al día»', () => {
    const r = calcularObra({ ...base, reprogramaciones: [rp('2026-09-28', 7, 'CLIENTE')] }, HOY);
    expect(r.programado).toBeCloseTo(50, 6);
    expect(r.situacion.texto).toBe('Al día · Sem 3 en curso');
    expect(r.plazos).toMatchObject({ finOriginal: '2026-10-24', finVigente: '2026-10-31', finControl: '2026-10-31', diasReprogramados: 7, diasExternos: 7, diasInternos: 0 });
  });

  it('causa interna: el fin vigente sube pero el plan NO se corre (sigue siendo atraso)', () => {
    const r = calcularObra({ ...base, reprogramaciones: [rp('2026-09-28', 7, 'INTERNO')] }, HOY);
    expect(r.programado).toBeCloseTo(100, 6);
    expect(r.situacion.texto).toBe('Retrasada');
    expect(r.plazos).toMatchObject({ finVigente: '2026-10-31', finControl: '2026-10-24', diasExternos: 0, diasInternos: 7 });
  });

  it('las fechas de las subpartidas no cambian al reprogramar', () => {
    const r = calcularObra({ ...base, reprogramaciones: [rp('2026-09-28', 7, 'CLIENTE')] }, HOY);
    expect(r.partidas[0].subpartidas[0]).toMatchObject({ inicio: '2026-09-21', fin: '2026-10-03' });
  });

  it('obra «En pausa» mientras hoy cae dentro de la reprogramación, sin días de retraso', () => {
    const r = calcularObra({ ...base, reprogramaciones: [rp('2026-10-05', 7, 'PERMISO_LICENCIA')] }, HOY);
    expect(r.situacion).toEqual({ clave: 'rp', texto: 'En pausa' });
    expect(r.plazos.enPausa).toBe(true);
    expect(r.plazos.diasRetraso).toBe(0);
  });

  it('terminada la pausa deja de estar «En pausa»', () => {
    const r = calcularObra({ ...base, reprogramaciones: [rp('2026-09-28', 7, 'CLIENTE')] }, HOY);
    expect(r.plazos.enPausa).toBe(false);
  });

  it('el fin vigente reprogramado evita el «fuera de plazo»', () => {
    const o = conSubs([A({ avance: [50, 20] })], { fin: '2026-10-02' });
    expect(calcularObra(o, HOY).plazos.diasFueraDePlazo).toBe(4);
    expect(calcularObra({ ...o, reprogramaciones: [rp('2026-09-25', 7, 'FUERZA_MAYOR')] }, HOY).plazos.diasFueraDePlazo).toBe(0);
  });
});

describe('motor · RC-14/15/16 plazos', () => {
  it('fuera de plazo: obra sin terminar pasado su fin vigente, día a día', () => {
    const o = conSubs([A({ avance: [50, 20] })]);
    expect(calcularObra(o, '2026-10-31').plazos.diasFueraDePlazo).toBe(7);
    expect(calcularObra(o, '2026-10-24').plazos.diasFueraDePlazo).toBe(0);
  });

  it('días de retraso: el corte menos la fecha en que el plan pedía el avance real', () => {
    const r = calcularObra(conSubs([A({ avance: [50, 20] })]), HOY);
    // Plan de la semana 2: 66,7 % el 29/09, 75 % el 30/09. Con 70 % real, la última fecha con
    // plan ≤ real es el 29/09; el corte es el 04/10 → 5 días de retraso.
    expect(r.plazos.diasRetraso).toBe(5);
  });

  it('próximo a vencer: el fin de control cae en los próximos 7 días', () => {
    const o = conSubs([A({ avance: [50, 20] })]);
    expect(calcularObra(o, '2026-10-17').plazos.proximoAVencer).toBe(true); // 24/10 = hoy + 7
    expect(calcularObra(o, '2026-10-16').plazos.proximoAVencer).toBe(false);
  });
});

describe('motor · RC-18/19 post venta', () => {
  const entregada = (p: Partial<ObraEntrada> = {}) => conSubs([A({ avance: [50, 50] })], { estado: 'POST_VENTA', entregaReal: '2026-10-03', ...p });

  it('Entregada; la post venta cuenta los días desde la entrega real', () => {
    const r = calcularObra(entregada(), HOY);
    expect(r.situacion.texto).toBe('Entregada');
    expect(r.postVenta).toMatchObject({ inicio: '2026-10-03', dias: 3, texto: 'En curso', cerrada: false });
    expect(r.semana.texto).toBe('Post venta');
  });

  it('con cierre: «Cerrada en N días»', () => {
    const r = calcularObra(entregada({ estado: 'CULMINADO', cierrePostVenta: '2026-10-05' }), HOY);
    expect(r.postVenta).toMatchObject({ dias: 2, texto: 'Cerrada en 2 días', cerrada: true });
  });

  it('una obra en ejecución no tiene post venta', () => {
    expect(calcularObra(obra(), HOY).postVenta).toBeNull();
  });
});

describe('motor · RC-23 adicionales y filtro de la Curva S', () => {
  const mixta = conSubs(
    [A({ avance: [50, 50] }), sub('01.02A', '2026-09-28', '2026-10-03', { tipo: 'ADICIONAL', avance: [0, 50] })],
  );

  it('resume las subpartidas adicionales', () => {
    const r = calcularObra(mixta, HOY);
    expect(r.adicionales).toEqual({ subpartidas: 1, avance: 50, pesoPct: 33 });
    expect(r.partidas[0].subpartidas[1].tipo).toBe('ADICIONAL');
    expect(r.partidas[0].subpartidas[0].tipo).toBe('CONTRACTUAL');
  });

  it('sin adicionales = null', () => {
    expect(calcularObra(obra(), HOY).adicionales).toBeNull();
  });

  it('la subpartida hereda el tipo de su partida', () => {
    const o = obra({ partidas: [{ item: 'AD', nombre: 'Adicionales', tipo: 'ADICIONAL', subpartidas: [sub('AD.01', '2026-09-28', '2026-10-03')] }] });
    expect(calcularObra(o, HOY).partidas[0].subpartidas[0].tipo).toBe('ADICIONAL');
  });

  it('Curva S: Todo, solo Contractual y solo Adicionales dan curvas distintas', () => {
    const todo = calcularCurvaS(mixta, HOY, 'todo')!;
    const contractual = calcularCurvaS(mixta, HOY, 'C')!;
    const adic = calcularCurvaS(mixta, HOY, 'A')!;
    const sem2 = (c: typeof todo) => c.semanas[1].real!;
    expect(sem2(contractual)).toBe(100); // 50 + 50
    expect(sem2(adic)).toBe(50); // 0 + 50
    expect(sem2(todo)).toBeCloseTo((12 * 100 + 6 * 50) / 18, 6); // ponderado por días laborables
    expect(sem2(todo)).toBeGreaterThan(sem2(adic));
    expect(sem2(todo)).toBeLessThan(sem2(contractual));
  });

  it('el filtro sin subpartidas del tipo pedido devuelve null', () => {
    expect(calcularCurvaS(obra(), HOY, 'A')).toBeNull();
  });
});

describe('motor · RC-22 Curva S', () => {
  const o = conSubs([A({ avance: [50, 20] })]);

  it('una fila por semana hasta el fin vigente, con el corte y la semana en curso', () => {
    const c = calcularObra(o, HOY).curvaS!;
    expect(c.semanas).toHaveLength(5);
    expect(c.inicioSemana1).toBe('2026-09-21');
    expect(c.semanaCorte).toBe(2);
    expect(c.semanas.filter((s) => s.enCurso).map((s) => s.semana)).toEqual([3]);
    expect(c.excede).toBe(false);
  });

  it('el real se dibuja solo hasta la semana en curso', () => {
    const c = calcularObra(o, HOY).curvaS!;
    expect(c.semanas.map((s) => s.real)).toEqual([50, 70, 70, null, null]);
  });

  it('el pactado reprogramado se separa del original y marca la semana entera en pausa', () => {
    const c = calcularObra({ ...o, reprogramaciones: [rp('2026-09-28', 14, 'CLIENTE')] }, HOY).curvaS!;
    expect(c.semanas).toHaveLength(7); // fin vigente = 24/10 + 14 = 07/11
    expect(c.semanas[1].semanaEnPausa).toBe(true);
    expect(c.semanas[2].semanaEnPausa).toBe(true);
    expect(c.semanas[1].pactado).toBeLessThan(c.semanas[1].pactadoOriginal);
  });

  it('una obra de más de 16 semanas se limita a 16 y avisa', () => {
    const c = calcularObra(obra({ fin: '2027-03-31' }), HOY).curvaS!;
    expect(c.semanas).toHaveLength(16);
    expect(c.excede).toBe(true);
  });

  it('en una obra que no está en ejecución el real iguala al pactado', () => {
    const c = calcularObra(conSubs([A({ avance: [50, 50] })], { estado: 'POST_VENTA' }), HOY).curvaS!;
    expect(c.semanas.map((s) => s.real)).toEqual(c.semanas.map((s) => s.pactado));
  });
});

describe('motor · RV avisos de lectura', () => {
  it('RV-09 avance menor a 1 y RV-10 avance en semana futura', () => {
    expect(codigos(conSubs([A({ avance: [0.5] })]))).toContain('RV-09');
    expect(codigos(conSubs([A({ avance: [10, null, null, null, 5] })]))).toContain('RV-10'); // semana 5 empieza 19/10
  });

  it('RV-11 ítem repetido (la partida y su primera subpartida pueden compartir número)', () => {
    const dup = conSubs([A(), sub('01.01', '2026-09-28', '2026-10-03')]);
    expect(codigos(dup)).toContain('RV-11');
    const compartido = obra({ partidas: [{ item: '01', nombre: 'P', subpartidas: [sub('01', '2026-09-21', '2026-09-26')] }] });
    expect(codigos(compartido)).not.toContain('RV-11');
  });

  it('RV-12 la meta no suma 100; RV-13 fuera de las 10 semanas', () => {
    expect(codigos(conSubs([A({ metas: [60, 60] })]))).toContain('RV-12');
    const larga = conSubs([sub('01.01', '2026-09-21', '2026-12-15')]);
    expect(codigos(larga)).toContain('RV-13');
    expect(codigos(larga)).not.toContain('RV-12');
  });

  it('RV-14 obra de más de 10 semanas', () => {
    expect(codigos(obra({ fin: '2026-12-30' }))).toContain('RV-14');
    expect(codigos(obra())).not.toContain('RV-14');
  });

  it('RV-15 actualización futura y RV-16 sin actualizar hace más de 14 días', () => {
    expect(codigos(obra({ fechaActualizacion: '2026-12-01' }))).toContain('RV-15');
    expect(codigos(obra({ fechaActualizacion: '2026-09-01' }))).toContain('RV-16');
    expect(codigos(obra({ fechaActualizacion: '2026-10-01' }))).not.toContain('RV-16');
  });

  it('RV-17 entregada sin el 100 %', () => {
    expect(codigos(conSubs([A({ avance: [10] })], { estado: 'POST_VENTA', entregaReal: '2026-10-03' }))).toContain('RV-17');
    expect(codigos(conSubs([A({ avance: [50, 50] })], { estado: 'POST_VENTA', entregaReal: '2026-10-03' }))).not.toContain('RV-17');
  });

  it('RV-18 fecha de entrega en una obra aún en ejecución, RV-19 post venta sin entrega, RV-20 cierre anterior', () => {
    expect(codigos(obra({ entregaReal: '2026-10-03' }))).toContain('RV-18');
    expect(codigos(obra({ estado: 'POST_VENTA' }))).toContain('RV-19');
    expect(codigos(obra({ estado: 'POST_VENTA', entregaReal: '2026-10-03', cierrePostVenta: '2026-10-01' }))).toContain('RV-20');
  });

  it('RV-21 «Próximo» que ya inició y RV-22 en ejecución sin avance', () => {
    expect(codigos(obra({ estado: 'PROXIMO' }))).toContain('RV-21');
    expect(codigos(obra())).toContain('RV-22');
    expect(codigos(conSubs([A({ avance: [10] })]))).not.toContain('RV-22');
  });

  it('un aviso de subpartida indica el ítem y el nombre', () => {
    const a = calcularObra(conSubs([A({ avance: [0.5] })]), HOY).avisos.find((x) => x.codigo === 'RV-09')!;
    expect(a).toMatchObject({ ambito: 'subpartida', item: '01.01' });
    expect(a.mensaje).toContain('Partida 01 › Sub 01.01');
  });
});

describe('motor · robustez', () => {
  it('es determinista: no depende de la hora del sistema', () => {
    const o = conSubs([A({ avance: [50, 20] })]);
    expect(calcularObra(o, HOY)).toEqual(calcularObra(o, HOY));
  });

  it('no modifica la entrada', () => {
    const o = conSubs([A({ avance: [50, 20], metas: [50, null] })]);
    const copia = JSON.parse(JSON.stringify(o));
    calcularObra(o, HOY);
    expect(o).toEqual(copia);
  });

  it('rechaza fechas inválidas', () => {
    expect(() => calcularObra(obra({ inicio: '21/09/2026' }), HOY)).toThrow('Fecha inválida');
    expect(() => calcularObra(obra(), '2026-13-01')).toThrow('Fecha inválida');
  });

  it('una obra sin partidas ni avance no rompe', () => {
    const r = calcularObra(obra({ partidas: [] }), HOY);
    expect(r.real).toBe(0);
    expect(r.partidas).toEqual([]);
  });
});
