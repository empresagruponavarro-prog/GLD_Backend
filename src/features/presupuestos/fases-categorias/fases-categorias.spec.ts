import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { PptoFasesCategoriasController } from './fases-categorias.controller.js';
import { PptoFasesCategoriasHandler } from './fases-categorias.handler.js';

describe('ppto_FasesCategorias (subpartidas)', () => {
  let controller: PptoFasesCategoriasController;
  const first = vi.fn();
  const create = vi.fn();
  const update = vi.fn();
  const remove = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();

    const dbMock = {
      orm: {
        public: {
          ppto_FasesCategorias: {
            first,
            create,
            where: vi.fn(() => ({ update, delete: remove })),
          },
        },
      },
    } as unknown as Database;

    const moduleRef = await Test.createTestingModule({
      controllers: [PptoFasesCategoriasController],
      providers: [PptoFasesCategoriasHandler, { provide: DB, useValue: dbMock }],
    }).compile();

    controller = moduleRef.get(PptoFasesCategoriasController);
  });

  it('crea una subpartida y responde 409 ante duplicado (23505) o partida inexistente (23503)', async () => {
    const row = { id: 1, IdpptoFaseCategoria: 'SUB-01', IdpptoFase: 'FASE-01', Descripcion: 'EXCAVACIONES' };
    create.mockResolvedValueOnce(row);
    await expect(
      controller.create({ IdpptoFaseCategoria: 'SUB-01', IdpptoFase: 'FASE-01', Descripcion: 'EXCAVACIONES' }),
    ).resolves.toEqual(row);

    create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
    await expect(controller.create({ IdpptoFaseCategoria: 'SUB-01' })).rejects.toBeInstanceOf(ConflictException);

    create.mockRejectedValueOnce(Object.assign(new Error('fk'), { code: '23503' }));
    await expect(controller.create({ IdpptoFaseCategoria: 'SUB-02', IdpptoFase: 'NO-EXISTE' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('actualiza una subpartida y responde 409 si la partida referenciada no existe (23503)', async () => {
    const current = { id: 2, IdpptoFaseCategoria: 'SUB-02', IdpptoFase: 'FASE-01', Descripcion: 'OLD' };
    first.mockResolvedValue(current);
    update.mockRejectedValueOnce(Object.assign(new Error('fk'), { code: '23503' }));

    await expect(controller.update('2', { IdpptoFase: 'INEXISTENTE' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('elimina una subpartida y responde 409 si está en uso (23503) o 404 si no existe', async () => {
    first.mockResolvedValueOnce(null);
    await expect(controller.remove('99')).rejects.toBeInstanceOf(NotFoundException);

    first.mockResolvedValueOnce({ id: 5, IdpptoFaseCategoria: 'SUB-05' });
    remove.mockResolvedValueOnce(undefined);
    await expect(controller.remove('5')).resolves.toEqual({ deleted: true, id: 5, code: 'SUB-05' });

    first.mockResolvedValueOnce({ id: 6, IdpptoFaseCategoria: 'SUB-06' });
    remove.mockRejectedValueOnce(Object.assign(new Error('fk'), { code: '23503' }));
    await expect(controller.remove('6')).rejects.toBeInstanceOf(ConflictException);
  });
});
