import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { LocalController } from './local.controller.js';
import { LocalHandler } from './local.handler.js';

describe('LocalController / LocalHandler', () => {
  let controller: LocalController;

  const localAll = vi.fn();
  const localFirst = vi.fn();
  const localCreate = vi.fn();
  const localUpdate = vi.fn();

  const empresasAll = vi.fn();
  const empresaFirst = vi.fn();

  const centrosAll = vi.fn();
  const centroFirst = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();

    const dbMock = {
      orm: {
        public: {
          local: {
            orderBy: vi.fn(() => ({ all: localAll })),
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({ all: localAll })),
              update: localUpdate,
            })),
            first: localFirst,
            create: localCreate,
          },
          Empresas: {
            all: empresasAll,
            first: empresaFirst,
          },
          CentroCostos: {
            all: centrosAll,
            first: centroFirst,
          },
        },
      },
    } as unknown as Database;

    const moduleRef = await Test.createTestingModule({
      controllers: [LocalController],
      providers: [LocalHandler, { provide: DB, useValue: dbMock }],
    }).compile();

    controller = moduleRef.get(LocalController);
  });

  describe('Regla de Exclusión Mutua (XOR: Empresa vs Centro de Costo)', () => {
    it('debe rechazar la creación si NO se envía ni empresa ni centro de costo', async () => {
      await expect(
        controller.create({
          codigo: 'LOC-01',
          nombre: 'Local Sin Asignar',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe rechazar la creación si se envían AMBOS (empresa Y centro de costo)', async () => {
      await expect(
        controller.create({
          codigo: 'LOC-02',
          nombre: 'Local Doble Asignación',
          id_empresa: 1,
          id_centro_costo: 2,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe crear exitosamente un local asignado a EMPRESA', async () => {
      empresaFirst.mockResolvedValue({ id_empresa: 1, razon_social: 'GLD CONSTRUCTORA' });
      localCreate.mockResolvedValue({ id: 10 });
      localFirst.mockResolvedValue({
        id: 10,
        codigo: 'SEDE-LIM',
        nombre: 'SEDE CENTRAL',
        direccion: 'Av. Javier Prado',
        id_empresa: 1,
        id_centro_costo: null,
        estado: true,
      });

      const res = await controller.create({
        codigo: 'SEDE-LIM',
        nombre: 'SEDE CENTRAL',
        direccion: 'Av. Javier Prado',
        id_empresa: 1,
      });

      expect(res.tipo_asignacion).toBe('EMPRESA');
      expect(res.id_empresa).toBe(1);
      expect(res.empresa_nombre).toBe('GLD CONSTRUCTORA');
      expect(res.id_centro_costo).toBeNull();
    });

    it('debe crear exitosamente un local asignado a CENTRO DE COSTO', async () => {
      centroFirst.mockResolvedValue({
        id: 5,
        centro_costo: 'OBRA LOS OLIVOS',
      });
      localCreate.mockResolvedValue({ id: 11 });
      localFirst.mockResolvedValue({
        id: 11,
        codigo: 'OBRA-OLV',
        nombre: 'OBRA LOS OLIVOS SEDE',
        direccion: null,
        id_empresa: null,
        id_centro_costo: 5,
        estado: true,
      });

      const res = await controller.create({
        codigo: 'OBRA-OLV',
        nombre: 'OBRA LOS OLIVOS SEDE',
        id_centro_costo: 5,
      });

      expect(res.tipo_asignacion).toBe('CENTRO_COSTO');
      expect(res.id_centro_costo).toBe(5);
      expect(res.centro_costo_codigo).toBe('CC-5');
      expect(res.centro_costo_nombre).toBe('OBRA LOS OLIVOS');
      expect(res.id_empresa).toBeNull();
    });

    it('debe derivar código y nombre del centro de costo cuando solo se envía el CC y la dirección', async () => {
      centroFirst.mockResolvedValue({ id: 340, centro_costo: 'ARUMA REMODELACION BENAVIDES' });
      localCreate.mockResolvedValue({ id: 12 });
      localFirst.mockResolvedValue({
        id: 12,
        codigo: 'CC-340',
        nombre: 'ARUMA REMODELACION BENAVIDES',
        direccion: 'Jr. Arquimedes 170',
        id_empresa: null,
        id_centro_costo: 340,
        estado: true,
      });

      await controller.create({ id_centro_costo: 340, direccion: 'Jr. Arquimedes 170' });

      expect(localCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          codigo: 'CC-340',
          nombre: 'ARUMA REMODELACION BENAVIDES',
          id_centro_costo: 340,
        }),
      );
    });
  });

  describe('Listado enriquecido', () => {
    it('debe listar locales enriqueciendo los nombres de empresa y centro de costo', async () => {
      localAll.mockResolvedValue([
        {
          id: 1,
          codigo: 'SEDE-LIM',
          nombre: 'SEDE LIMA',
          direccion: 'Av. Javier Prado',
          id_empresa: 1,
          id_centro_costo: null,
          estado: true,
        },
        {
          id: 2,
          codigo: 'OBRA-OLV',
          nombre: 'OBRA OLIVOS',
          direccion: null,
          id_empresa: null,
          id_centro_costo: 5,
          estado: true,
        },
      ]);
      empresasAll.mockResolvedValue([{ id_empresa: 1, razon_social: 'GLD CONSTRUCTORA' }]);
      centrosAll.mockResolvedValue([
        { id: 5, centro_costo: 'OBRA LOS OLIVOS' },
      ]);

      const res = await controller.list();

      expect(res).toHaveLength(2);
      expect(res[0].tipo_asignacion).toBe('EMPRESA');
      expect(res[0].empresa_nombre).toBe('GLD CONSTRUCTORA');
      expect(res[1].tipo_asignacion).toBe('CENTRO_COSTO');
      expect(res[1].centro_costo_nombre).toBe('OBRA LOS OLIVOS');
    });
  });
});
