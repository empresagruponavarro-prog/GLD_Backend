import { Test } from '@nestjs/testing';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { NivelController } from './nivel.controller.js';
import { NivelHandler } from './nivel.handler.js';

describe('NivelController / NivelHandler', () => {
  let controller: NivelController;

  const all = vi.fn();
  const first = vi.fn();
  const create = vi.fn();
  const update = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();

    const dbMock = {
      orm: {
        public: {
          nivel: {
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
      controllers: [NivelController],
      providers: [NivelHandler, { provide: DB, useValue: dbMock }],
    }).compile();

    controller = moduleRef.get(NivelController);
  });

  it('lista los niveles', async () => {
    all.mockResolvedValue([
      { id: 1, codigo: 'PISO-01', descripcion: 'PISO 1', estado: true },
      { id: 2, codigo: 'PISO-02', descripcion: 'PISO 2', estado: true },
    ]);

    const res = await controller.list();
    expect(res).toHaveLength(2);
    expect(res[0].codigo).toBe('PISO-01');
  });

  it('crea un nivel exitosamente', async () => {
    create.mockResolvedValue({ id: 3, codigo: 'SOTANO-01', descripcion: 'SÓTANO 1', estado: true });

    const res = await controller.create({ codigo: 'SOTANO-01', descripcion: 'SÓTANO 1' });
    expect(res.id).toBe(3);
    expect(res.codigo).toBe('SOTANO-01');
  });
});
