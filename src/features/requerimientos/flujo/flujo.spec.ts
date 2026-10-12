import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { AlmacenSql } from '../../almacen/shared/almacen-sql.js';
import { InventarioLedger } from '../../almacen/shared/inventario-ledger.js';
import { RequerimientoHandler } from '../requerimiento/requerimiento.handler.js';
import { FlujoController } from './flujo.controller.js';
import { FlujoHandler } from './flujo.handler.js';

const generarDocumentosOrigen = vi.hoisted(() => vi.fn());
vi.mock('../shared/generar-documentos-origen.js', () => ({ generarDocumentosOrigen }));

describe('requerimientos / flujo', () => {
  let controller: FlujoController;
  const sqlRows = vi.fn();
  const sqlRun = vi.fn();
  const getById = vi.fn();

  /** La primera consulta de cada accion bloquea el FUR y devuelve su estado actual. */
  const conEstado = (estado: string, tipo = 'COMPRA') =>
    sqlRows.mockResolvedValueOnce([{ id: 1, estado, id_centro_costo: 10, id_fase: null, tipo, id_cotizacion_ganadora: null }]);

  beforeEach(async () => {
    vi.clearAllMocks();
    sqlRows.mockResolvedValue([]);
    sqlRun.mockResolvedValue(1);
    getById.mockResolvedValue({ id: 1 });
    generarDocumentosOrigen.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      controllers: [FlujoController],
      providers: [
        FlujoHandler,
        { provide: DB, useValue: { transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})) } as unknown as Database },
        { provide: AlmacenSql, useValue: { rows: sqlRows, run: sqlRun } },
        { provide: RequerimientoHandler, useValue: { getById } },
        { provide: InventarioLedger, useValue: {} },
      ],
    }).compile();
    controller = moduleRef.get(FlujoController);
  });

  it('responde 404 si el requerimiento no existe', async () => {
    await expect(controller.enviar(9, {})).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('transiciones inválidas', () => {
    it.each([
      ['ENVIADO'],
      ['COTIZADO'],
      ['APROBADO'],
      ['RECHAZADO'],
      ['ANULADO'],
    ])('no se puede enviar un requerimiento %s', async (estado) => {
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

    it.each(['BORRADOR', 'COTIZADO', 'OBSERVADO', 'APROBADO', 'RECHAZADO', 'ANULADO'])('no se puede cerrar la cotización de un requerimiento %s', async (estado) => {
      conEstado(estado);
      await expect(controller.cerrarCotizacion(1, {})).rejects.toBeInstanceOf(ConflictException);
    });

    it.each(['BORRADOR', 'ENVIADO', 'OBSERVADO', 'APROBADO', 'RECHAZADO', 'ANULADO'])('no se puede reabrir la cotización de un requerimiento %s', async (estado) => {
      conEstado(estado);
      await expect(controller.reabrirCotizacion(1, {})).rejects.toBeInstanceOf(ConflictException);
    });

    it.each(['RECHAZADO', 'ANULADO'])('un requerimiento %s es final y no se puede anular', async (estado) => {
      conEstado(estado);
      await expect(controller.anular(1, {})).rejects.toBeInstanceOf(ConflictException);
    });

    it('ninguna transición inválida modifica datos', () => {
      expect(sqlRun).not.toHaveBeenCalled();
    });
  });

  describe('cotización', () => {
    it('no cierra la cotización de un requerimiento que no es de compra', async () => {
      conEstado('ENVIADO', 'PLANILLA_PERSONAL');
      await expect(controller.cerrarCotizacion(1, {})).rejects.toThrow(/solo los requerimientos de compra/i);
    });

    it('no cierra el cuadro comparativo sin cotizaciones', async () => {
      conEstado('ENVIADO');
      sqlRows.mockResolvedValueOnce([{ n: 0 }]);
      await expect(controller.cerrarCotizacion(1, {})).rejects.toThrow(/al menos una cotizacion/);
      expect(sqlRun).not.toHaveBeenCalled();
    });

    it('cierra el cuadro comparativo con una sola cotización (de 1 a n)', async () => {
      conEstado('ENVIADO');
      sqlRows.mockResolvedValueOnce([{ n: 1 }]).mockResolvedValueOnce([{ id_solicitante: 7 }]);
      await expect(controller.cerrarCotizacion(1, {})).resolves.toEqual({ id: 1 });
      expect(sqlRun).toHaveBeenCalledTimes(2); // estado + evento
    });

    it('reabre un requerimiento COTIZADO', async () => {
      conEstado('COTIZADO');
      sqlRows.mockResolvedValueOnce([{ id_solicitante: 7 }]);
      await expect(controller.reabrirCotizacion(1, {})).resolves.toEqual({ id: 1 });
    });
  });

  describe('anular', () => {
    it('rechaza anular un requerimiento con documentos de origen vigentes', async () => {
      conEstado('APROBADO');
      sqlRows.mockResolvedValueOnce([{ existe: true }]);
      await expect(controller.anular(1, {})).rejects.toThrow(/documentos de origen vigentes/);
      expect(sqlRun).not.toHaveBeenCalled();
    });

    it('anula un requerimiento aprobado cuyos documentos están anulados', async () => {
      conEstado('APROBADO');
      sqlRows.mockResolvedValueOnce([{ existe: false }]);
      await expect(controller.anular(1, { comentario: 'ya no se necesita' })).resolves.toEqual({ id: 1 });
      expect(sqlRun).toHaveBeenCalledTimes(2); // cambio de estado + evento
    });

    it('anula un requerimiento COTIZADO', async () => {
      conEstado('COTIZADO');
      sqlRows.mockResolvedValueOnce([{ existe: false }]);
      await expect(controller.anular(1, {})).resolves.toEqual({ id: 1 });
    });
  });

  describe('transiciones válidas', () => {
    it.each(['BORRADOR', 'OBSERVADO'])('envía un requerimiento %s', async (estado) => {
      conEstado(estado);
      sqlRows.mockResolvedValueOnce([{ id_solicitante: 7 }]);
      await expect(controller.enviar(1, {})).resolves.toEqual({ id: 1 });
      expect(sqlRun).toHaveBeenCalledTimes(2); // estado + evento
    });

    it.each(['ENVIADO', 'COTIZADO'])('observa un requerimiento %s exigiendo un aprobador Trabajador', async (estado) => {
      conEstado(estado);
      sqlRows.mockResolvedValueOnce([{ nombre: 'Ana', ok: true }]);
      await expect(controller.observar(1, { id_aprobador: 5, comentario: 'falta detalle' })).resolves.toEqual({ id: 1 });
    });

    it('rechaza la aprobación si el aprobador no es Trabajador', async () => {
      conEstado('COTIZADO');
      sqlRows.mockResolvedValueOnce([{ nombre: 'ACME', ok: false }]);
      await expect(controller.aprobar(1, { id_aprobador: 5, id_cotizacion_ganadora: 2 })).rejects.toThrow(/no es un Anexo de tipo Trabajador/);
      expect(sqlRun).not.toHaveBeenCalled();
    });

    it('una compra no se aprueba desde ENVIADO: primero se cierra el cuadro comparativo', async () => {
      conEstado('ENVIADO');
      sqlRows.mockResolvedValueOnce([{ nombre: 'Ana', ok: true }]);
      await expect(controller.aprobar(1, { id_aprobador: 5, id_cotizacion_ganadora: 2 })).rejects.toThrow(/COTIZADO/);
    });

    it('un requerimiento que no es de compra se aprueba desde ENVIADO, no desde COTIZADO', async () => {
      conEstado('COTIZADO', 'CAJA_CHICA');
      sqlRows.mockResolvedValueOnce([{ nombre: 'Ana', ok: true }]);
      await expect(controller.aprobar(1, { id_aprobador: 5 })).rejects.toThrow(/desde ENVIADO/);
    });

    it('una compra exige elegir la cotización ganadora', async () => {
      conEstado('COTIZADO');
      sqlRows.mockResolvedValueOnce([{ nombre: 'Ana', ok: true }]);
      await expect(controller.aprobar(1, { id_aprobador: 5 })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza una cotización ganadora de otro requerimiento', async () => {
      conEstado('COTIZADO');
      sqlRows.mockResolvedValueOnce([{ nombre: 'Ana', ok: true }]).mockResolvedValueOnce([]);
      await expect(controller.aprobar(1, { id_aprobador: 5, id_cotizacion_ganadora: 99 })).rejects.toThrow(/no pertenece al requerimiento/);
    });

    it('rechaza aprobar la misma línea dos veces', async () => {
      conEstado('ENVIADO', 'CAJA_CHICA');
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
      conEstado('ENVIADO', 'CAJA_CHICA');
      sqlRows.mockResolvedValueOnce([{ nombre: 'Ana', ok: true }]).mockResolvedValueOnce([{ ok: false }]);
      await expect(controller.aprobar(1, { id_aprobador: 5 })).rejects.toThrow(/al menos una línea/);
      expect(generarDocumentosOrigen).not.toHaveBeenCalled();
    });

    it('aprueba una compra cotizada eligiendo al ganador y genera los documentos de origen', async () => {
      conEstado('COTIZADO');
      sqlRows
        .mockResolvedValueOnce([{ nombre: 'Ana', ok: true }])
        .mockResolvedValueOnce([{ id: 2 }])
        .mockResolvedValueOnce([{ ok: true }]);
      await expect(
        controller.aprobar(1, { id_aprobador: 5, id_cotizacion_ganadora: 2, comentario_adjudicacion: 'entrega inmediata' }),
      ).resolves.toEqual({ id: 1 });
      expect(generarDocumentosOrigen).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), 1, 2);
    });

    it('aprueba una caja chica enviada y genera su documento', async () => {
      conEstado('ENVIADO', 'CAJA_CHICA');
      sqlRows.mockResolvedValueOnce([{ nombre: 'Ana', ok: true }]).mockResolvedValueOnce([{ ok: true }]);
      await expect(controller.aprobar(1, { id_aprobador: 5, comentario: 'OK' })).resolves.toEqual({ id: 1 });
      expect(generarDocumentosOrigen).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), 1, null);
    });
  });
});
