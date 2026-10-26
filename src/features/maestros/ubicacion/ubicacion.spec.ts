import { Test } from '@nestjs/testing';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { UbicacionController } from './ubicacion.controller.js';
import { UbicacionHandler } from './ubicacion.handler.js';

describe('UbicacionController / UbicacionHandler', () => {
  let controller: UbicacionController;

  const allUbicacion = vi.fn();
  const firstUbicacion = vi.fn();
  const createUbicacion = vi.fn();
  const updateUbicacion = vi.fn();

  const allLocal = vi.fn();
  const firstLocal = vi.fn();

  const allNivel = vi.fn();
  const firstNivel = vi.fn();

  const allAmbiente = vi.fn();
  const firstAmbiente = vi.fn();

  const allArea = vi.fn();
  const firstArea = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();

    const dbMock = {
      orm: {
        public: {
          ubicacion: {
            orderBy: vi.fn(() => ({ all: allUbicacion })),
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({ all: allUbicacion })),
              update: updateUbicacion,
            })),
            first: firstUbicacion,
            create: createUbicacion,
          },
          local: {
            all: allLocal,
            first: firstLocal,
          },
          nivel: {
            all: allNivel,
            first: firstNivel,
          },
          ambiente: {
            all: allAmbiente,
            first: firstAmbiente,
          },
          area: {
            all: allArea,
            first: firstArea,
          },
          Empresas: {
            all: vi.fn().mockResolvedValue([{ id_empresa: 1, razon_social: 'GLD CONSTRUCTORA S.A.C.' }]),
            first: vi.fn().mockResolvedValue({ id_empresa: 1, razon_social: 'GLD CONSTRUCTORA S.A.C.' }),
          },
          CentroCostos: {
            all: vi.fn().mockResolvedValue([]),
            first: vi.fn().mockResolvedValue(null),
          },
        },
      },
    } as unknown as Database;

    const moduleRef = await Test.createTestingModule({
      controllers: [UbicacionController],
      providers: [UbicacionHandler, { provide: DB, useValue: dbMock }],
    }).compile();

    controller = moduleRef.get(UbicacionController);
  });

  it('lista ubicaciones con datos enriquecidos de local, nivel, ambiente y área', async () => {
    allUbicacion.mockResolvedValue([
      {
        id: 1,
        codigo: 'SEDE-LIM-P2-OF-TI',
        id_local: 10,
        id_nivel: 20,
        id_ambiente: 30,
        id_area: 40,
        observaciones: 'Piso 2',
        estado: true,
      },
    ]);
    allLocal.mockResolvedValue([
      { id: 10, codigo: 'SEDE-LIM', nombre: 'SEDE CENTRAL LIMA', id_empresa: 1, id_centro_costo: null },
    ]);
    allNivel.mockResolvedValue([{ id: 20, codigo: 'P2', descripcion: 'PISO 2' }]);
    allAmbiente.mockResolvedValue([{ id: 30, codigo: 'OF-TI', descripcion: 'OFICINA DE TI' }]);
    allArea.mockResolvedValue([{ id: 40, codigo: 'TI', nombre: 'TECNOLOGÍA DE LA INFORMACIÓN' }]);

    const res = await controller.list();
    expect(res).toHaveLength(1);
    expect(res[0].codigo).toBe('SEDE-LIM-P2-OF-TI');
    expect(res[0].local_nombre).toBe('SEDE CENTRAL LIMA');
    expect(res[0].local_tipo_asignacion).toBe('EMPRESA');
    expect(res[0].local_asignado_a).toBe('GLD CONSTRUCTORA S.A.C.');
    expect(res[0].nivel_descripcion).toBe('PISO 2');
    expect(res[0].ambiente_descripcion).toBe('OFICINA DE TI');
    expect(res[0].area_nombre).toBe('TECNOLOGÍA DE LA INFORMACIÓN');
  });

  it('crea una ubicación autogenerando código cuando no se envía', async () => {
    firstLocal.mockResolvedValue({ id: 10, codigo: 'SEDE-LIM', nombre: 'SEDE CENTRAL LIMA' });
    firstNivel.mockResolvedValue({ id: 20, codigo: 'P2', descripcion: 'PISO 2' });
    firstAmbiente.mockResolvedValue({ id: 30, codigo: 'OF-TI', descripcion: 'OFICINA DE TI' });
    firstArea.mockResolvedValue({ id: 40, codigo: 'TI', nombre: 'TECNOLOGÍA DE LA INFORMACIÓN' });

    createUbicacion.mockResolvedValue({ id: 1 });
    firstUbicacion.mockResolvedValue({
      id: 1,
      codigo: 'SEDE-LIM-P2-OF-TI',
      id_local: 10,
      id_nivel: 20,
      id_ambiente: 30,
      id_area: 40,
      observaciones: null,
      estado: true,
    });

    const res = await controller.create({
      id_local: 10,
      id_nivel: 20,
      id_ambiente: 30,
      id_area: 40,
    });

    expect(createUbicacion).toHaveBeenCalledWith(
      expect.objectContaining({
        codigo: 'SEDE-LIM-P2-OF-TI',
        id_local: 10,
        id_nivel: 20,
        id_ambiente: 30,
        id_area: 40,
      }),
    );
    expect(res.codigo).toBe('SEDE-LIM-P2-OF-TI');
  });

  it('resuelve ubicación por tupla local, nivel y ambiente', async () => {
    firstUbicacion
      .mockResolvedValueOnce({
        id: 1,
        id_local: 10,
        id_nivel: 20,
        id_ambiente: 30,
      })
      .mockResolvedValueOnce({
        id: 1,
        codigo: 'SEDE-LIM-P2-OF-TI',
        id_local: 10,
        id_nivel: 20,
        id_ambiente: 30,
        id_area: null,
        observaciones: null,
        estado: true,
      });

    firstLocal.mockResolvedValue({ id: 10, codigo: 'SEDE-LIM', nombre: 'SEDE CENTRAL LIMA' });
    firstNivel.mockResolvedValue({ id: 20, codigo: 'P2', descripcion: 'PISO 2' });
    firstAmbiente.mockResolvedValue({ id: 30, codigo: 'OF-TI', descripcion: 'OFICINA DE TI' });

    const res = await controller.resolver({
      id_local: 10,
      id_nivel: 20,
      id_ambiente: 30,
    });

    expect(res).not.toBeNull();
    expect(res?.codigo).toBe('SEDE-LIM-P2-OF-TI');
  });

  it('si la tupla no existe, resolver devuelve null y no crea nada', async () => {
    firstUbicacion.mockResolvedValueOnce(null);

    const res = await controller.resolver({
      id_local: 10,
      id_nivel: 20,
      id_ambiente: 30,
    });

    expect(res).toBeNull();
    expect(createUbicacion).not.toHaveBeenCalled();
  });
});
