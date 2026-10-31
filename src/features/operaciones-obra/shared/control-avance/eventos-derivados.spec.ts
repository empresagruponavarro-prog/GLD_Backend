import { eventosDerivados, situacionClave, type UltimosEventos } from './eventos-derivados.js';
import type { EstadoObra } from './control-avance.types.js';
import type { ObraResumen } from './resumen-portafolio.js';

const NADA: UltimosEventos = { situacion: null, vencidoDeFin: null };

function obra(p: { efectivo?: EstadoObra; situacion?: string; fuera?: number; fin?: string } = {}): ObraResumen {
  return {
    id_centro_costo: 5,
    nombre: 'Tambo Lince',
    resultado: {
      estadoEfectivo: p.efectivo ?? 'EN_EJECUCION',
      situacion: { clave: 'crit', texto: p.situacion ?? 'Retrasada' },
      desviacion: -20.4,
      real: 59.7,
      programado: 80.1,
      plazos: { diasFueraDePlazo: p.fuera ?? 0, finVigente: p.fin ?? '2026-10-24' },
    },
  } as unknown as ObraResumen;
}

describe('eventos derivados · situación (D17)', () => {
  it('«Al día · Sem N en curso» es la misma situación que «A tiempo»: no genera avisos cada lunes', () => {
    expect(situacionClave('Al día · Sem 5 en curso')).toBe('A tiempo');
    expect(situacionClave('Al día · en curso')).toBe('A tiempo');
    expect(situacionClave('Retrasada')).toBe('Retrasada');
    expect(eventosDerivados(obra({ situacion: 'Al día · Sem 6 en curso' }), { situacion: 'A tiempo', vencidoDeFin: null })).toEqual([]);
  });

  it('la primera vez guarda una línea base informativa (sin «antes»)', () => {
    const [e] = eventosDerivados(obra({ situacion: 'A tiempo' }), NADA);
    expect(e).toMatchObject({ tipo: 'SITUACION', antes: null, despues: 'A tiempo', severidad: 'info' });
    expect(e.titulo).toMatch(/situación registrada/);
  });

  it('si no cambió, no guarda nada', () => {
    expect(eventosDerivados(obra(), { situacion: 'Retrasada', vencidoDeFin: null })).toEqual([]);
  });

  it('pasar a Retrasada es crítico y deja antes y después', () => {
    const [e] = eventosDerivados(obra(), { situacion: 'A tiempo', vencidoDeFin: null });
    expect(e).toMatchObject({ tipo: 'SITUACION', antes: 'A tiempo', despues: 'Retrasada', severidad: 'crit', idCentroCosto: 5 });
    expect(e.titulo).toBe('Tambo Lince pasó a Retrasada');
    expect(e.detalle).toBe('Desviación -20 pp (59% real vs 80% programado)');
  });

  it('En riesgo es una advertencia y volver a A tiempo es una buena noticia', () => {
    expect(eventosDerivados(obra({ situacion: 'En riesgo' }), { situacion: 'A tiempo', vencidoDeFin: null })[0].severidad).toBe('warn');
    expect(eventosDerivados(obra({ situacion: 'A tiempo' }), { situacion: 'Retrasada', vencidoDeFin: null })[0].severidad).toBe('good');
  });

  it('solo se evalúan las obras en ejecución (efectivo)', () => {
    for (const efectivo of ['PROXIMO', 'POST_VENTA', 'CULMINADO', 'SUSPENDIDA', 'CANCELADA'] as const) {
      expect(eventosDerivados(obra({ efectivo, fuera: 5 }), NADA), efectivo).toEqual([]);
    }
  });
});

describe('eventos derivados · plazo vencido', () => {
  const previoSit: UltimosEventos = { situacion: 'Retrasada', vencidoDeFin: null };

  it('un evento por cada fin vigente que se vence', () => {
    const [e] = eventosDerivados(obra({ fuera: 3, fin: '2026-10-24' }), previoSit);
    expect(e).toMatchObject({ tipo: 'VENCIDO', severidad: 'crit', despues: '2026-10-24' });
    expect(e.detalle).toContain('3 días fuera de plazo');
  });

  it('no se repite mientras sea el mismo fin vigente', () => {
    expect(eventosDerivados(obra({ fuera: 4, fin: '2026-10-24' }), { ...previoSit, vencidoDeFin: '2026-10-24' })).toEqual([]);
  });

  it('si se reprograma y vuelve a vencer, genera otro', () => {
    const e = eventosDerivados(obra({ fuera: 1, fin: '2026-10-31' }), { ...previoSit, vencidoDeFin: '2026-10-24' });
    expect(e).toHaveLength(1);
    expect(e[0].despues).toBe('2026-10-31');
  });

  it('una obra dentro de plazo no genera VENCIDO', () => {
    expect(eventosDerivados(obra({ fuera: 0 }), previoSit)).toEqual([]);
  });

  it('puede salir una situación y un vencimiento a la vez', () => {
    const e = eventosDerivados(obra({ fuera: 2 }), { situacion: 'A tiempo', vencidoDeFin: null });
    expect(e.map((x) => x.tipo)).toEqual(['SITUACION', 'VENCIDO']);
  });

  it('singular: «1 día fuera de plazo»', () => {
    expect(eventosDerivados(obra({ fuera: 1 }), previoSit)[0].detalle).toContain('1 día fuera de plazo');
  });
});
