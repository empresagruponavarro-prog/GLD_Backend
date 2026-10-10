import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { AlmacenSql } from '../../almacen/shared/almacen-sql.js';
import { RequerimientoHandler } from '../requerimiento/requerimiento.handler.js';
import { FlujoController } from './flujo.controller.js';
import { FlujoHandler } from './flujo.handler.js';

describe('requerimientos / flujo', () => {
  let controller: FlujoController;
  const sqlRows = vi.fn();
  const sqlRun = vi.fn();
  const getById = vi.fn();

  /** La primera consulta de cada accion bloquea el FUR y devuelve su estado actual. */
  const conEstado = (estado: string) => sqlRows.mockResolvedValueOnce([{ id: 1, estado, id_centro_costo: 10, id_fase: null }]);

  beforeEach(async () => {
    vi.clearAllMocks();
    sqlRows.mockResolvedValue([]);
    sqlRun.mockResolvedValue(1);
    getById.mockResolvedValue({ id: 1 });
    const moduleRef = await Test.createTestingModule({
      controllers: [FlujoController],
      providers: [
        FlujoHandler,
        { provide: DB, useValue: { transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})) } as unknown as Database },
        { provide: AlmacenSql, useValue: { rows: sqlRows, run: sqlRun } },
        { provide: RequerimientoHandler, useValue: { getById } },
      ],
    }).compile();
    controller = moduleRef.get(FlujoController);
  });

  it('responde 404 si el requerimiento no existe', async () => {
    await expect(controller.enviar(9, {})).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('transiciones inválidas', () => {
    it.each([
      ['enviar', 'ENVIADO'],
      ['enviar', 'APROBADO'],
      ['enviar', 'RECHAZADO'],
      ['enviar', 'ANULADO'],
    ])('no se puede %s un requerimiento %s', async (_accion, estado) => {
      conEstado(estado);
      await expect(controller.enviar(1, {})).rejects.toBeInstanceOf(ConflictException);
    });

    it.each(['BORRADOR', 'OBSERVADO', 'APROBADO', 'RECHAZADO', 'ANULADO'])('no se puede aprobar un requerimiento %s', async (estado) => {
      conEstado(estado);
      await expect(controller.aprobar(1, { id_aprobador: 5 })).rejects.toBeInstanceOf(ConflictException);
    });

    it.each(['BORRADOR', 'OBSERVADO', 'APROBADO', 'RECHAZADO', 'ANULADO'])('no se puede observar ni rechazar un requerimiento %s', async (estado) => {
      conEstado(estado);
      await expect(controller.observar(1, { id_aprobador: 5, comentario: 'x' })).rejects.toBeInstanceOf(ConflictException);
      conEstado(estado);
      await expect(controller.rechazar(1, { id_aprobador: 5, comentario: 'x' })).rejects.toBeInstanceOf(ConflictException);
    });

    it.each(['RECHAZADO', 'ANULADO'])('un requerimiento %s es final y no se puede anular', async (estado) => {
      conEstado(estado);
      await expect(controller.anular(1, {})).rejects.toBeInstanceOf(ConflictException);
    });

    it('ninguna transición inválida modifica datos', () => {
      expect(sqlRun).not.toHaveBeenCalled();
    });
  });

  describe('anular', () => {
    it('rechaza anular un requerimiento con órdenes de compra vinculadas', async () => {
      conEstado('APROBADO');
      sqlRows.mockResolvedValueOnce([{ existe: true }]);
      await expect(controller.anular(1, {})).rejects.toThrow(/órdenes de compra vinculadas/);
      expect(sqlRun).not.toHaveBeenCalled();
    });

    it('anula un requerimiento aprobado sin órdenes de compra', async () => {
      conEstado('APROBADO');
      sqlRows.mockResolvedValueOnce([{ existe: false }]);
      await expect(controller.anular(1, { comentario: 'ya no se necesita' })).resolves.toEqual({ id: 1 });
      expect(sqlRun).toHaveBeenCalledTimes(2); // cambio de estado + evento
    });
  });

  describe('transiciones válidas', () => {
    it.each(['BORRADOR', 'OBSERVADO'])('envía un requerimiento %s', async (estado) => {
      conEstado(estado);
      sqlRows.mockResolvedValueOnce([{ id_solicitante: 7 }]);
      await expect(controller.enviar(1, {})).resolves.toEqual({ id: 1 });
      expect(sqlRun).toHaveBeenCalledTimes(2); // estado + evento
    });

    it('observa un requerimiento enviado exigiendo un aprobador Trabajador', async () => {
      conEstado('ENVIADO');
      sqlRows.mockResolvedValueOnce([{ nombre: 'Ana', ok: true }]);
      await expect(controller.observar(1, { id_aprobador: 5, comentario: 'falta detalle' })).resolves.toEqual({ id: 1 });
    });

    it('rechaza la aprobación si el aprobador no es Trabajador', async () => {
      conEstado('ENVIADO');
      sqlRows.mockResolvedValueOnce([{ nombre: 'ACME', ok: false }]);
      await expect(controller.aprobar(1, { id_aprobador: 5 })).rejects.toThrow(/no es un Anexo de tipo Trabajador/);
      expect(sqlRun).not.toHaveBeenCalled();
    });

    it('rechaza aprobar la misma línea dos veces', async () => {
      conEstado('ENVIADO');
      sqlRows.mockResolvedValueOnce([{ nombre: 'Ana', ok: true }]);
      await expect(
        controller.aprobar(1, {
          id_aprobador: 5,
          lineas: [
            { id_detalle: 1, cantidad_aprobada: '1' },
            { id_detalle: 1, cantidad_aprobada: '2' },
          ],
        }),
      ).rejects.toThrow(/líneas repetidas/);
    });

    it('no aprueba si ninguna línea queda con cantidad mayor a 0', async () => {
      conEstado('ENVIADO');
      sqlRows.mockResolvedValueOnce([{ nombre: 'Ana', ok: true }]).mockResolvedValueOnce([{ ok: false }]);
      await expect(controller.aprobar(1, { id_aprobador: 5 })).rejects.toThrow(/al menos una línea/);
    });

    it('aprueba un requerimiento enviado', async () => {
      conEstado('ENVIADO');
      sqlRows.mockResolvedValueOnce([{ nombre: 'Ana', ok: true }]).mockResolvedValueOnce([{ ok: true }]);
      await expect(controller.aprobar(1, { id_aprobador: 5, comentario: 'OK' })).resolves.toEqual({ id: 1 });
    });
  });
});
