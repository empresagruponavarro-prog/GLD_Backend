import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { Database } from '../../prisma/prisma.module.js';
import { CronogramaHandler } from './cronograma/cronograma.handler.js';
import type { ObraSemanaDto } from './cronograma/cronograma.dto.js';
import { ObraIncidenciasHandler } from './incidencias/incidencias.handler.js';
import { calcularKpis } from './obra/obra.handler.js';
import { PlanosHandler, siguienteVersion } from './planos/planos.handler.js';
import { ResidentesHandler } from './residentes/residentes.handler.js';
import { compact, toDateOnly, whatsappUrl } from './shared/obra-shared.js';

function semana(overrides: Partial<ObraSemanaDto>): ObraSemanaDto {
  return {
    id: 1,
    numero_semana: 1,
    etiqueta_semana: 'SEM 01',
    fecha_inicio: '2026-10-05',
    fecha_fin: '2026-10-11',
    fase_principal: 'Preliminares',
    porcentaje_meta: 0,
    porcentaje_real: 0,
    estado: 'Programado',
    orden: 1,
    ...overrides,
  };
}

/** Construye un mock mínimo de la tabla con cadenas where/orderBy/all/update/delete. */
function tableMock() {
  const all = vi.fn().mockResolvedValue([]);
  const update = vi.fn();
  const del = vi.fn().mockResolvedValue({});
  const chain = { all, update, delete: del, orderBy: vi.fn(() => ({ all })) };
  return {
    first: vi.fn(),
    create: vi.fn(),
    where: vi.fn(() => chain),
    all,
    update,
    delete: del,
  };
}

function dbWith(tables: Record<string, ReturnType<typeof tableMock>>) {
  const cc = tableMock();
  cc.first.mockResolvedValue({ id: 10, centro_costo: 'Obra X' });
  return { orm: { public: { CentroCostos: cc, ...tables } } } as unknown as Database;
}

describe('operaciones-obra / shared', () => {
  it('compact elimina claves undefined', () => {
    expect(compact({ a: 1, b: undefined, c: null })).toEqual({ a: 1, c: null });
  });

  it('toDateOnly normaliza y valida', () => {
    expect(toDateOnly('2026-10-12T00:00:00Z')).toBe('2026-10-12');
    expect(toDateOnly('')).toBeUndefined();
    expect(() => toDateOnly('12/10/2026')).toThrow(BadRequestException);
  });

  it('whatsappUrl agrega prefijo 51 a celulares de 9 dígitos', () => {
    expect(whatsappUrl('987 654 321')).toBe('https://wa.me/51987654321');
    expect(whatsappUrl('+51 987654321')).toBe('https://wa.me/51987654321');
    expect(whatsappUrl(null)).toBeUndefined();
  });

  it('siguienteVersion incrementa la versión mayor', () => {
    expect(siguienteVersion('v1.0')).toBe('v2.0');
    expect(siguienteVersion('3')).toBe('v4.0');
    expect(siguienteVersion('Rev.B')).toBe('Rev.B.1');
  });
});

describe('operaciones-obra / calcularKpis', () => {
  const cronograma = [
    semana({ id: 1, numero_semana: 1, fecha_inicio: '2026-10-05', fecha_fin: '2026-10-11', porcentaje_meta: 20, porcentaje_real: 22, estado: 'Completado' }),
    semana({ id: 2, numero_semana: 2, fecha_inicio: '2026-10-12', fecha_fin: '2026-10-18', porcentaje_meta: 45, porcentaje_real: 40, estado: 'Retrasado' }),
    semana({ id: 3, numero_semana: 3, fecha_inicio: '2026-10-19', fecha_fin: '2026-10-25', porcentaje_meta: 100 }),
  ];

  it('usa la semana en curso para la meta y la última con avance para el real', () => {
    const kpis = calcularKpis(cronograma, [], undefined, {}, '2026-10-14');
    expect(kpis.semana_activa).toBe(2);
    expect(kpis.avance_meta_global).toBe(45);
    expect(kpis.avance_real_global).toBe(40);
    expect(kpis.desviacion).toBe(-5);
    expect(kpis.semanas_retrasadas).toBe(1);
    expect(kpis.dias_totales).toBe(21);
    expect(kpis.dias_transcurridos).toBe(10);
  });

  it('antes del inicio no hay semana activa', () => {
    const kpis = calcularKpis(cronograma, [], undefined, {}, '2026-09-01');
    expect(kpis.semana_activa).toBe(0);
    expect(kpis.dias_transcurridos).toBe(0);
  });

  it('cuenta incidencias no resueltas', () => {
    const inc = [{ estado: 'PENDIENTE' }, { estado: 'RESUELTA' }, { estado: 'EN PROCESO' }] as never[];
    expect(calcularKpis([], inc, undefined, {}).incidencias_pendientes).toBe(2);
  });
});

describe('operaciones-obra / CronogramaHandler', () => {
  it('asigna numero_semana = max + 1 y etiqueta por defecto', async () => {
    const tabla = tableMock();
    tabla.all.mockResolvedValue([
      { id: 1, numero_semana: 1, etiqueta_semana: 'SEM 01', fecha_inicio: '2026-10-05', fecha_fin: '2026-10-11' },
      { id: 2, numero_semana: 3, etiqueta_semana: 'SEM 03', fecha_inicio: '2026-10-19', fecha_fin: '2026-10-25' },
    ]);
    tabla.create.mockImplementation(async (data: Record<string, unknown>) => ({ id: 9, ...data }));
    const handler = new CronogramaHandler(dbWith({ obra_semanas_cronograma: tabla }));

    const res = await handler.create(10, { fecha_inicio: '2026-10-26', fecha_fin: '2026-11-01', fase_principal: 'Acabados' });

    expect(res.numero_semana).toBe(4);
    expect(res.etiqueta_semana).toBe('SEM 04');
    expect(res.estado).toBe('Programado');
  });

  it('rechaza numero_semana duplicado', async () => {
    const tabla = tableMock();
    tabla.all.mockResolvedValue([{ id: 1, numero_semana: 1, fecha_inicio: '', fecha_fin: '' }]);
    const handler = new CronogramaHandler(dbWith({ obra_semanas_cronograma: tabla }));
    await expect(
      handler.create(10, { numero_semana: 1, fecha_inicio: '2026-10-05', fecha_fin: '2026-10-11', fase_principal: 'X' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rechaza fecha_inicio > fecha_fin', async () => {
    const handler = new CronogramaHandler(dbWith({ obra_semanas_cronograma: tableMock() }));
    await expect(
      handler.create(10, { fecha_inicio: '2026-10-20', fecha_fin: '2026-10-11', fase_principal: 'X' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('operaciones-obra / ResidentesHandler', () => {
  it('no elimina residentes de otro centro de costo', async () => {
    const tabla = tableMock();
    tabla.first.mockResolvedValue(null);
    const handler = new ResidentesHandler(dbWith({ obra_residentes: tabla }));
    await expect(handler.remove(10, 99)).rejects.toBeInstanceOf(NotFoundException);
    expect(tabla.delete).not.toHaveBeenCalled();
  });
});

describe('operaciones-obra / PlanosHandler', () => {
  it('nueva versión desactiva la anterior y enlaza id_plano_anterior', async () => {
    const tabla = tableMock();
    tabla.first.mockResolvedValue({
      id: 5, id_centro_costo: 10, codigo_plano: 'ARQ-01', nombre_plano: 'Planta', disciplina: 'Arquitectura',
      version: 'v1.0', es_vigente: true, id_plano_anterior: null, emitido_por: 'Ing. A',
    });
    tabla.update.mockResolvedValue({});
    tabla.create.mockImplementation(async (data: Record<string, unknown>) => ({ id: 6, ...data }));
    const handler = new PlanosHandler(dbWith({ obra_planos: tabla }));

    const res = await handler.nuevaVersion(10, 5, {});

    expect(tabla.update).toHaveBeenCalledWith({ es_vigente: false });
    expect(res.version).toBe('v2.0');
    expect(res.id_plano_anterior).toBe(5);
    expect(res.es_vigente).toBe(true);
  });

  it('impide duplicar un código vigente', async () => {
    const tabla = tableMock();
    tabla.first.mockResolvedValue({ id: 1 });
    const handler = new PlanosHandler(dbWith({ obra_planos: tabla }));
    await expect(
      handler.create(10, { codigo_plano: 'arq-01', nombre_plano: 'Planta', disciplina: 'Arquitectura' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('operaciones-obra / ObraIncidenciasHandler', () => {
  it('genera código correlativo a partir del máximo existente', async () => {
    const tabla = tableMock();
    tabla.all.mockResolvedValue([{ codigo_incidencia: 'INC-10-001' }, { codigo_incidencia: 'INC-10-004' }]);
    tabla.create.mockImplementation(async (data: Record<string, unknown>) => ({ id: 3, ...data }));
    const handler = new ObraIncidenciasHandler(dbWith({ obra_incidencias_rfi: tabla }));

    const res = await handler.create(10, { titulo: 'Fuga', descripcion: 'Fuga de agua en SS.HH.' });

    expect(res.codigo_incidencia).toBe('INC-10-005');
    expect(res.estado).toBe('PENDIENTE');
  });

  it('registra fecha_resolucion al pasar a RESUELTA', async () => {
    const tabla = tableMock();
    tabla.first.mockResolvedValue({ id: 3, estado: 'PENDIENTE' });
    tabla.update.mockImplementation(async (data: Record<string, unknown>) => ({ id: 3, codigo_incidencia: 'INC-10-001', ...data }));
    const handler = new ObraIncidenciasHandler(dbWith({ obra_incidencias_rfi: tabla }));

    const res = await handler.update(10, 3, { estado: 'RESUELTA' });

    expect(res.estado).toBe('RESUELTA');
    expect(res.fecha_resolucion).toBeTruthy();
  });
});
