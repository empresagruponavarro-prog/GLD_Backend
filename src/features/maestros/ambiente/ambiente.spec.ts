import { Test } from '@nestjs/testing';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { AmbienteController } from './ambiente.controller.js';
import { AmbienteHandler } from './ambiente.handler.js';

describe('AmbienteController / AmbienteHandler', () => {
  let controller: AmbienteController;

  const all = vi.fn();
  const first = vi.fn();
  const create = vi.fn();
  const update = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();

    const dbMock = {
      orm: {
        public: {
          ambiente: {
            orderBy: vi.fn(() => ({ all })),
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({ all })),
              update,
            })),
            first,
            create,
          },
        },
      },
    } as unknown as Database;

    const moduleRef = await Test.createTestingModule({
      controllers: [AmbienteController],
      providers: [AmbienteHandler, { provide: DB, useValue: dbMock }],
    }).compile();

    controller = moduleRef.get(AmbienteController);
  });

  it('lista los ambientes', async () => {
    all.mockResolvedValue([
      { id: 1, codigo: 'AMB-01', descripcion: 'OFICINA GERENCIA', estado: true },
      { id: 2, codigo: 'AMB-02', descripcion: 'SALA JUNTAS', estado: true },
    ]);

    const res = await controller.list();
    expect(res).toHaveLength(2);
    expect(res[0].codigo).toBe('AMB-01');
  });

  it('crea un ambiente exitosamente', async () => {
    create.mockResolvedValue({ id: 5, codigo: 'ALM-01', descripcion: 'ALMACÉN PRINCIPAL', estado: true });

    const res = await controller.create({ codigo: 'ALM-01', descripcion: 'ALMACÉN PRINCIPAL' });
    expect(res.id).toBe(5);
    expect(res.codigo).toBe('ALM-01');
  });
});
