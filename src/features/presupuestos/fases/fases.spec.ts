import 'reflect-metadata';
import { BadRequestException, ConflictException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { PptoFasesController } from './fases.controller.js';
import { CreatePptoFaseDto, UpdatePptoFaseDto } from './fases.dto.js';
import { PptoFasesHandler } from './fases.handler.js';

describe('ppto_Fases (partidas)', () => {
  let controller: PptoFasesController;
  const first = vi.fn();
  const create = vi.fn();
  const update = vi.fn();
  const remove = vi.fn();
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

  beforeEach(async () => {
    vi.clearAllMocks();

    const dbMock = {
      orm: {
        public: {
          ppto_Fases: {
            first,
            create,
            where: vi.fn(() => ({ update, delete: remove })),
          },
        },
      },
    } as unknown as Database;

    const moduleRef = await Test.createTestingModule({
      controllers: [PptoFasesController],
      providers: [PptoFasesHandler, { provide: DB, useValue: dbMock }],
    }).compile();

    controller = moduleRef.get(PptoFasesController);
  });

  describe('DTO nullable numéricos (CreatePptoFaseDto / UpdatePptoFaseDto)', () => {
    it('acepta null, vacío y string numérico válido, y preserva undefined', async () => {
      const omitido = await pipe.transform(
        { FaseProyecto: 'OBRA CIVIL' },
        { type: 'body', metatype: UpdatePptoFaseDto },
      );
      expect(omitido).toBeInstanceOf(UpdatePptoFaseDto);
      expect(omitido.id_empresa).toBeUndefined();
      expect(omitido.id_centro_costos_principal).toBeUndefined();

      const limpio = await pipe.transform(
        { id_empresa: null, id_centro_costos_principal: '' },
        { type: 'body', metatype: UpdatePptoFaseDto },
      );
      expect(limpio.id_empresa).toBeNull();
      expect(limpio.id_centro_costos_principal).toBeNull();

      const numerico = await pipe.transform(
        { IdpptoFase: 'FASE-01', id_empresa: '1', id_centro_costos_principal: 25 },
        { type: 'body', metatype: CreatePptoFaseDto },
      );
      expect(numerico.id_empresa).toBe(1);
      expect(numerico.id_centro_costos_principal).toBe(25);
    });

    it('rechaza 0 y valores no numéricos', async () => {
      await expect(
        pipe.transform({ id_empresa: 0 }, { type: 'body', metatype: UpdatePptoFaseDto }),
      ).rejects.toBeInstanceOf(BadRequestException);

      const dto = plainToInstance(UpdatePptoFaseDto, { id_centro_costos_principal: 'abc' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('PptoFasesHandler', () => {
    it('crea con null cuando se omiten empresa y cadena, y responde 409 en 23505 o 23503', async () => {
      const created = { id: 1, IdpptoFase: 'FASE-01', id_empresa: null, id_centro_costos_principal: null, FaseProyecto: 'CIVIL' };
      create.mockResolvedValue(created);

      await expect(controller.create({ IdpptoFase: 'FASE-01', FaseProyecto: 'CIVIL' })).resolves.toEqual(created);
      expect(create).toHaveBeenCalledWith({
        IdpptoFase: 'FASE-01',
        id_empresa: null,
        id_centro_costos_principal: null,
        FaseProyecto: 'CIVIL',
      });

      create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
      await expect(controller.create({ IdpptoFase: 'FASE-01' })).rejects.toBeInstanceOf(ConflictException);

      create.mockRejectedValueOnce(Object.assign(new Error('fk'), { code: '23503' }));
      await expect(controller.create({ IdpptoFase: 'FASE-02', id_empresa: 999 })).rejects.toBeInstanceOf(ConflictException);
    });

    it('actualiza limpiando id_empresa e id_centro_costos_principal a null y responde 409 ante 23503', async () => {
      const current = { id: 7, IdpptoFase: 'FASE-07', id_empresa: 1, id_centro_costos_principal: 25, FaseProyecto: 'OLD' };
      const updated = { ...current, id_empresa: null, id_centro_costos_principal: null, FaseProyecto: 'NUEVA' };
      first.mockResolvedValue(current);
      update.mockResolvedValue(updated);

      await expect(
        controller.update('7', { FaseProyecto: 'NUEVA', id_empresa: null, id_centro_costos_principal: null }),
      ).resolves.toEqual(updated);
      expect(update).toHaveBeenCalledWith({
        id_empresa: null,
        id_centro_costos_principal: null,
        FaseProyecto: 'NUEVA',
      });

      update.mockRejectedValueOnce(Object.assign(new Error('fk'), { code: '23503' }));
      await expect(controller.update('7', { IdpptoFase: 'FASE-OTRA' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('elimina una partida y responde 409 cuando está en uso (23503) o 404 si no existe', async () => {
      first.mockResolvedValueOnce(null);
      await expect(controller.remove('99')).rejects.toBeInstanceOf(NotFoundException);

      first.mockResolvedValueOnce({ id: 3, IdpptoFase: 'FASE-03' });
      remove.mockResolvedValueOnce(undefined);
      await expect(controller.remove('3')).resolves.toEqual({ deleted: true, id: 3, code: 'FASE-03' });

      first.mockResolvedValueOnce({ id: 4, IdpptoFase: 'FASE-04' });
      remove.mockRejectedValueOnce(Object.assign(new Error('fk'), { code: '23503' }));
      await expect(controller.remove('4')).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
