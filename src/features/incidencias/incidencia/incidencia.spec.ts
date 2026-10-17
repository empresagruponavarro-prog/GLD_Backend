import { NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { Test } from '@nestjs/testing';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { IncidenciaController } from './incidencia.controller.js';
import { IncidenciaHandler } from './incidencia.handler.js';

function makeRow(id = 1, incidencia = 'Fuga de agua') {
  return {
    id,
    promotor: 'Admin',
    docRegistrador: 'DNI-001',
    cargoRegistrador: 'Supervisor',
    solicitante: 'Vecino',
    docSolicitante: 'DNI-002',
    telefonoSolicitante: '999111222',
    domicilioSolicitante: 'Av. Principal 123',
    fechaIncidencia: Temporal.Instant.from('2026-09-05T10:00:00.000Z'),
    horaIncidencia: '10:30',
    origenIncidencia: 'DIRECTO',
    viaOrigen: 'Calle',
    cuadra: '4',
    urbanizacion: 'Las Flores',
    sectorVecinal: 'Centro',
    tipificacion: 'INCIDENCIA TÉCNICA',
    direccionExacta: 'Calle 5 #100',
    incidencia,
    prioridadCategoria: 'NORMAL',
    latitud: '-12.04',
    longitud: '-77.03',
    gerenciaAsignada: null,
    representante: null,
    estado: 'PENDIENTE',
    accionPrevia: null,
    accionTomada: null,
    aprobacion: null,
    documentoGestrad: null,
    fechaInicio: Temporal.Instant.from('2026-09-05T00:00:00.000Z'),
    fechaFin: null,
    fechaCreacion: Temporal.Instant.from('2026-09-05T10:00:00.000Z'),
  };
}

describe('incidencia', () => {
  let controller: IncidenciaController;
  let handler: IncidenciaHandler;
  const create = vi.fn();
  const first = vi.fn();
  const all = vi.fn();
  const update = vi.fn();
  const remove = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();

    const dbMock = {
      orm: {
        public: {
          Incidencia: {
            create,
            first,
            orderBy: vi.fn(() => ({
              where: vi.fn(() => ({ all })),
              all,
            })),
            where: vi.fn(() => ({ update, delete: remove })),
          },
        },
      },
    } as unknown as Database;

    const moduleRef = await Test.createTestingModule({
      controllers: [IncidenciaController],
      providers: [IncidenciaHandler, { provide: DB, useValue: dbMock }],
    }).compile();

    controller = moduleRef.get(IncidenciaController);
    handler = moduleRef.get(IncidenciaHandler);
  });

  it('lista las incidencias', async () => {
    const rows = [makeRow(2), makeRow(1)];
    all.mockResolvedValue(rows);
    await expect(controller.list({})).resolves.toEqual(rows);
  });

  it('aplica filtros al listar', async () => {
    const rows = [makeRow(1)];
    all.mockResolvedValue(rows);
    await expect(controller.list({ estado: 'PENDIENTE' })).resolves.toEqual(rows);
  });

  it('obtiene por id', async () => {
    const row = makeRow(1);
    first.mockResolvedValue(row);
    await expect(controller.getById(1)).resolves.toEqual(row);
    expect(first).toHaveBeenCalledWith({ id: 1 });
  });

  it('responde 404 cuando no existe', async () => {
    first.mockResolvedValue(null);
    await expect(controller.getById(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('crea con valores por defecto', async () => {
    const row = makeRow(1);
    create.mockResolvedValue(row);
    await expect(controller.create({ incidencia: 'Fuga de agua' })).resolves.toEqual(row);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        incidencia: 'Fuga de agua',
        estado: 'PENDIENTE',
        origenIncidencia: 'DIRECTO',
        tipificacion: 'INCIDENCIA TÉCNICA',
        prioridadCategoria: 'NORMAL',
      }),
    );
  });

  it('duplica una incidencia', async () => {
    const original = makeRow(1, 'Fuga de agua');
    const copy = makeRow(2, '(Copia) Fuga de agua');
    first.mockResolvedValue(original);
    create.mockResolvedValue(copy);
    await expect(controller.duplicate(1)).resolves.toEqual(copy);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ incidencia: '(Copia) Fuga de agua' }));
  });

  it('actualiza solo los campos enviados', async () => {
    const row = makeRow(1);
    update.mockResolvedValue({ ...row, estado: 'ATENDIDA' });
    await expect(controller.update(1, { estado: 'ATENDIDA' })).resolves.toMatchObject({
      estado: 'ATENDIDA',
    });
    expect(update).toHaveBeenCalledWith({ estado: 'ATENDIDA' });
  });

  it('responde 404 al actualizar una inexistente', async () => {
    update.mockResolvedValue(null);
    await expect(controller.update(99, { estado: 'ATENDIDA' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('elimina una incidencia', async () => {
    remove.mockResolvedValue(makeRow(1));
    await expect(controller.remove(1)).resolves.toBeUndefined();
  });

  it('responde 404 al eliminar una inexistente', async () => {
    remove.mockResolvedValue(null);
    await expect(controller.remove(99)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('exporta a xlsx una fila por incidencia filtrada con su cabecera', async () => {
    all.mockResolvedValue([makeRow(2), makeRow(1)]);
    const buffer = await handler.generateExcelXlsx({ estado: 'PENDIENTE' });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Incidencias');
    expect(sheet?.rowCount).toBe(3);
    expect(sheet?.getRow(1).getCell(1).value).toBe('ID');
    expect(sheet?.getRow(2).getCell(1).value).toBe(2);
    expect(sheet?.getRow(2).getCell(13).value).toBe('Fuga de agua');
  });

  it('exporta a csv con cabecera y una fila por incidencia', async () => {
    all.mockResolvedValue([makeRow(1)]);
    const csv = await handler.generateExcelCsv({});
    expect(csv.split(/\r?\n/)).toHaveLength(2);
    expect(csv).toContain('"Fuga de agua"');
  });
});