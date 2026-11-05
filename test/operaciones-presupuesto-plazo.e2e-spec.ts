import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import 'dotenv/config';
import pg from 'pg';
import { App } from 'supertest/types';
import { aDia, deDia, lunesDe } from '../src/features/operaciones-obra/shared/control-avance/calendario.js';
import { hoyLima } from '../src/features/operaciones-obra/shared/obra-shared.js';
import { apiConSesion, borrarUsuarioE2E, crearUsuarioE2E } from './helpers/sesion.js';
import { AppModule } from './../src/app.module.js';

/**
 * GRP, fase F3, contra la BD de DATABASE_URL. Crea sus propios centros de costo (`E2E-OBG-*`), anexos y presupuestos
 * y los elimina al final. Debe correr en serie con los demás e2e de operaciones (comparten el usuario E2E-ADMIN).
 *
 *  - S-05: una obra con presupuesto no inicia ni avanza mientras su Principal no esté aprobado.
 *  - S-02: el peso de las subpartidas es su monto; si la obra pesa por monto, toda subpartida lleva monto.
 *  - S-02/S-05: inicio, fin y semanas se mantienen de acuerdo y se fijan al iniciar la obra.
 */
describe('Presupuesto, monto y plazo de la obra (e2e)', () => {
  let app: INestApplication<App>;
  let db: pg.Client;

  const hoy = hoyLima();
  const w1 = lunesDe(aDia(hoy)) - 14; // la obra empezó hace dos semanas: hoy cae en la semana 3
  const inicio = deDia(w1);
  const fin = deDia(w1 + 33);
  const proximoLunes = lunesDe(aDia(hoy)) + 7;

  let jefe = 0;
  let cliente = 0;
  let ccP = 0; // con presupuesto, para el bloqueo y el monto
  let ccM = 0; // sin iniciar, para el plazo
  let idPartida = 0;
  let idSub1 = 0;
  let idSub2 = 0;
  const api = () => apiConSesion(app);
  const obra = (cc: number) => `/operaciones/obra/${cc}`;
  const ccFila = async (cc: number) =>
    (await db.query(`select fecha_inicio::text i, fecha_fin_prog::text f from "CentroCostos" where id = $1`, [cc])).rows[0] as { i: string; f: string };
  const semanasFicha = async (cc: number) => (await db.query(`select semanas_totales s from obra_datos_generales where id_centro_costo = $1`, [cc])).rows[0].s as number;

  beforeAll(async () => {
    db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
    await db.connect();
    await crearUsuarioE2E(db);
    const anexo = async (nombre: string, tipo: string) =>
      (await db.query(`insert into anexos ("tipoAnexo", "Anexo", estado) values ($1, $2, true) returning id`, [tipo, nombre])).rows[0].id as number;
    jefe = await anexo('E2E-OBG Jefe', 'Trabajador');
    cliente = await anexo('E2E-OBG Cliente', 'Cliente');
    const crearCc = async (nombre: string, i: string, f: string) =>
      (
        await db.query(
          `insert into "CentroCostos" (centro_costo, estado, fecha_inicio, fecha_fin_prog, periodo, id_anexo) values ($1, 'ABIERTO', $2, $3, 2026, $4) returning id`,
          [nombre, i, f, cliente],
        )
      ).rows[0].id as number;
    ccP = await crearCc('E2E-OBG-P', inicio, fin);
    ccM = await crearCc('E2E-OBG-M', deDia(proximoLunes), deDia(proximoLunes + 41)); // 6 semanas

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    for (const cc of [ccP, ccM]) await api().patch(`${obra(cc)}/generales`).send({ departamento: 'Lima', id_jefe_proyecto: jefe }).expect(200);
  });

  afterAll(async () => {
    if (db) {
      // `id_centro_costo` de los presupuestos es SET NULL: se borran antes que el centro de costo (sus fases, en cascada).
      await db.query(`delete from "ppto_Principal" where id_centro_costo in (select id from "CentroCostos" where centro_costo like 'E2E-OBG-%')`);
      await db.query(`delete from "CentroCostos" where centro_costo like 'E2E-OBG-%'`); // obra_* en cascada
      await db.query(`delete from anexos where "Anexo" like 'E2E-OBG %'`);
      await borrarUsuarioE2E(db);
      await db.end();
    }
    await app?.close();
  });

  // ─── S-05: sin presupuesto aprobado no inicia ni avanza ───────────────────────
  describe('presupuesto aprobado', () => {
    it('una obra con presupuesto sin aprobar no inicia', async () => {
      await db.query(`insert into "ppto_Principal" ("IdPresupuesto", "Version", "TipoPpto", "Estado", estado_ppto, id_centro_costo) values ('E2E-OBG-PPTO-P', 'V1', 'Principal', 'En_Revision', 'EN_REVISION', $1)`, [ccP]);
      const res = await api().post(`${obra(ccP)}/estado`).send({ estado: 'EN_EJECUCION' }).expect(409);
      expect(res.body.message).toMatch(/presupuesto Principal aún no está aprobado/);
      expect((await api().get(`${obra(ccP)}/control`).expect(200)).body.estado_obra).toBeNull();
    });

    it('aprobado el Principal, la obra inicia y avanza; si deja de estar aprobado, el avance se bloquea', async () => {
      await db.query(`update "ppto_Principal" set estado_ppto = 'APROBADO', "Estado" = 'Aprobado' where "IdPresupuesto" = 'E2E-OBG-PPTO-P'`);
      await api().post(`${obra(ccP)}/estado`).send({ estado: 'EN_EJECUCION' }).expect(201);
      idPartida = (await api().post(`${obra(ccP)}/partidas`).send({ item: '01', nombre: 'Obras civiles' }).expect(201)).body.id;
      idSub1 = (
        await api().post(`${obra(ccP)}/partidas/${idPartida}/subpartidas`).send({ item: '01.01', nombre: 'Tabiquería', fecha_inicio: inicio, fecha_fin: deDia(w1 + 12) }).expect(201)
      ).body.id;
      await api().put(`${obra(ccP)}/avance/semanas/1`).send({ lineas: [{ idSubpartida: idSub1, avance: 10 }] }).expect(200);

      await db.query(`update "ppto_Principal" set estado_ppto = 'EN_REVISION' where "IdPresupuesto" = 'E2E-OBG-PPTO-P'`);
      const res = await api().put(`${obra(ccP)}/avance/semanas/2`).send({ lineas: [{ idSubpartida: idSub1, avance: 10 }] }).expect(409);
      expect(res.body.message).toMatch(/no puede registrar avance/);

      await db.query(`update "ppto_Principal" set estado_ppto = 'APROBADO' where "IdPresupuesto" = 'E2E-OBG-PPTO-P'`);
      await api().put(`${obra(ccP)}/avance/semanas/2`).send({ lineas: [{ idSubpartida: idSub1, avance: 10 }] }).expect(200);
    });

    it('una obra sin presupuesto (cargada desde el Excel) no se bloquea', async () => {
      // ccM no tiene presupuesto: inicia sin aprobar nada (se deshace en la sección del plazo).
      expect((await db.query(`select count(*)::int n from "ppto_Principal" where id_centro_costo = $1`, [ccM])).rows[0].n).toBe(0);
    });
  });

  // ─── S-02: peso por monto ─────────────────────────────────────────────────────
  describe('monto de las subpartidas', () => {
    it('mientras ninguna lleva monto, el avance pesa por duración', async () => {
      const r = (await api().get(`${obra(ccP)}/control`).expect(200)).body.resultado;
      expect(r.pesoPor).toBe('DURACION');
    });

    it('al ponerle monto a la única subpartida, la obra pesa por monto y exige monto a las demás', async () => {
      const res = await api().patch(`${obra(ccP)}/subpartidas/${idSub1}`).send({ monto: 100 }).expect(200);
      expect(Number(res.body.monto)).toBe(100);
      const nueva = { item: '01.02', nombre: 'Pisos', fecha_inicio: inicio, fecha_fin: deDia(w1 + 12) };
      const sinMonto = await api().post(`${obra(ccP)}/partidas/${idPartida}/subpartidas`).send(nueva).expect(400);
      expect(sinMonto.body.message).toMatch(/pesa su avance por monto/);
      await api().post(`${obra(ccP)}/partidas/${idPartida}/subpartidas`).send({ ...nueva, monto: 0 }).expect(400);
      idSub2 = (await api().post(`${obra(ccP)}/partidas/${idPartida}/subpartidas`).send({ ...nueva, monto: 300 }).expect(201)).body.id;
    });

    it('no se puede quitar el monto a una subpartida mientras la obra pesa por monto', async () => {
      await api().patch(`${obra(ccP)}/subpartidas/${idSub2}`).send({ monto: null }).expect(400);
      await api().patch(`${obra(ccP)}/subpartidas/${idSub2}`).send({ monto: 0 }).expect(400);
      const ok = await api().patch(`${obra(ccP)}/subpartidas/${idSub2}`).send({ monto: 400 }).expect(200);
      expect(Number(ok.body.monto)).toBe(400);
    });

    it('el control entrega el peso de cada subpartida como porcentaje del monto', async () => {
      const r = (await api().get(`${obra(ccP)}/control`).expect(200)).body.resultado;
      expect(r.pesoPor).toBe('MONTO');
      const subs = r.partidas[0].subpartidas as { item: string; peso: number; pesoPct: number }[];
      expect(subs.map((s) => [s.item, s.peso, s.pesoPct])).toEqual([['01.01', 100, 20], ['01.02', 400, 80]]);
      expect(r.partidas[0].pesoPct).toBe(100);
    });
  });

  // ─── S-02 / S-05: plazo ───────────────────────────────────────────────────────
  describe('plazo de la obra', () => {
    it('antes de iniciar, cambiar las semanas de la ficha recalcula el fin del centro de costo', async () => {
      await api().patch(`${obra(ccM)}/generales`).send({ semanas_totales: 4 }).expect(200);
      expect((await ccFila(ccM)).f).toBe(deDia(proximoLunes + 27)); // 4 semanas = 28 días
      expect(await semanasFicha(ccM)).toBe(4);
    });

    it('antes de iniciar, cambiar solo el inicio corre el fin los mismos días', async () => {
      await api().patch(`${obra(ccM)}/generales`).send({ fecha_inicio: deDia(proximoLunes + 7) }).expect(200);
      const f = await ccFila(ccM);
      expect(f).toEqual({ i: deDia(proximoLunes + 7), f: deDia(proximoLunes + 34) });
      expect(await semanasFicha(ccM)).toBe(4);
    });

    it('antes de iniciar, cambiar el fin recalcula las semanas; fin y semanas incoherentes se rechazan', async () => {
      await api().patch(`${obra(ccM)}/generales`).send({ fecha_fin_prog: deDia(proximoLunes + 7 + 13) }).expect(200);
      expect(await semanasFicha(ccM)).toBe(2);
      const res = await api().patch(`${obra(ccM)}/generales`).send({ semanas_totales: 8, fecha_fin_prog: deDia(proximoLunes + 400) }).expect(400);
      expect(res.body.message).toMatch(/no coincide con 8 semana/);
    });

    it('antes de iniciar, editar el plazo desde el centro de costo mantiene las semanas de la ficha', async () => {
      await api().patch(`/centros-costos/${ccM}`).send({ FechaFinProg: deDia(proximoLunes + 7 + 20) }).expect(200);
      expect(await semanasFicha(ccM)).toBe(3); // 21 días
    });

    it('una vez iniciada la obra, inicio, fin y semanas ya no se editan: se reprograma', async () => {
      await api().post(`${obra(ccM)}/estado`).send({ estado: 'EN_EJECUCION' }).expect(201);
      const actual = await ccFila(ccM);

      const inicioNuevo = await api().patch(`${obra(ccM)}/generales`).send({ fecha_inicio: deDia(proximoLunes + 30) }).expect(409);
      expect(inicioNuevo.body.message).toMatch(/reprogramación/);
      await api().patch(`${obra(ccM)}/generales`).send({ fecha_fin_prog: deDia(proximoLunes + 90) }).expect(409);
      await api().patch(`${obra(ccM)}/generales`).send({ semanas_totales: 9 }).expect(409);
      expect(await ccFila(ccM)).toEqual(actual);
      expect(await semanasFicha(ccM)).toBe(3);

      // Reenviar lo mismo no es un cambio; y el resto de la ficha se sigue editando.
      await api().patch(`${obra(ccM)}/generales`).send({ fecha_inicio: actual.i, fecha_fin_prog: actual.f, semanas_totales: 3, comentario: 'sigue editable' }).expect(200);
    });

    it('el centro de costo tampoco cambia el plazo de una obra iniciada, pero acepta reenviar las mismas fechas', async () => {
      const actual = await ccFila(ccM);
      const res = await api().patch(`/centros-costos/${ccM}`).send({ FechaIncio: deDia(proximoLunes + 30) }).expect(409);
      expect(res.body.message).toMatch(/reprogramación/);
      await api().patch(`/centros-costos/${ccM}`).send({ FechaIncio: actual.i, FechaFinProg: actual.f, CentroCosto: 'E2E-OBG-M' }).expect(200);
      expect(await ccFila(ccM)).toEqual(actual);
    });

    it('la obra con avance registrado también tiene el plazo fijo, aunque su estado no lo diga', async () => {
      // ccP ya tiene avance (semanas 1 y 2) y está en ejecución.
      await api().patch(`${obra(ccP)}/generales`).send({ fecha_inicio: deDia(w1 + 7) }).expect(409);
    });
  });
});
