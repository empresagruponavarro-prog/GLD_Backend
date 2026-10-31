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
 * Control de avance de obra (Dashboard de Operaciones, fase 3) contra la BD de DATABASE_URL.
 * Crea sus propios centros de costo (`E2E-OPS-*`), anexos y presupuesto, y los elimina al final.
 *
 * Las fechas son relativas a hoy (Lima): la obra empezó hace dos semanas, así que hoy cae en la
 * semana 3 y la semana 2 es la última cerrada. La subpartida A dura 12 días laborables (metas 50/50).
 */
describe('Control de avance de obra (e2e)', () => {
  let app: INestApplication<App>;
  let db: pg.Client;

  const hoy = hoyLima();
  const w1 = lunesDe(aDia(hoy)) - 14;
  const inicio = deDia(w1);
  const fin = deDia(w1 + 33);
  const finSub = deDia(w1 + 12); // sábado de la semana 2

  let cc = 0;
  let cc2 = 0;
  let jefe = 0;
  let coordinador = 0;
  let proveedor = 0;
  let cliente = 0;
  let idPresupuesto = 0;
  let idPartida = 0;
  let idSub = 0;
  let idSubAjena = 0;
  const base = () => `/operaciones/obra/${cc}`;
  const api = () => apiConSesion(app);

  beforeAll(async () => {
    db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
    await db.connect();
    await crearUsuarioE2E(db);

    const anexo = async (nombre: string, tipo: string) =>
      (await db.query(`insert into anexos ("tipoAnexo", "Anexo", estado) values ($1, $2, true) returning id`, [tipo, nombre])).rows[0].id as number;
    jefe = await anexo('E2E-OPS Jefe de proyecto', 'Trabajador');
    coordinador = await anexo('E2E-OPS Coordinador', 'Trabajador');
    proveedor = await anexo('E2E-OPS Proveedor', 'Proveedor');
    cliente = await anexo('E2E-OPS Cliente', 'Cliente');

    const crearCc = async (nombre: string) =>
      (await db.query(`insert into "CentroCostos" (centro_costo, estado, fecha_inicio, fecha_fin_prog, periodo, id_anexo) values ($1, 'ABIERTO', $2, $3, 2026, $4) returning id`, [nombre, inicio, fin, cliente]))
        .rows[0].id as number;
    cc = await crearCc('E2E-OPS-1');
    cc2 = await crearCc('E2E-OPS-2');

    // Presupuesto de la segunda obra: 1 fase y 2 categorías
    await db.query(`insert into "ppto_Fases" ("IdpptoFase", "FaseProyecto") values ('E2E-OPS-F1', 'E2E FASE ARQUITECTURA')`);
    await db.query(`insert into "ppto_FasesCategorias" ("IdpptoFaseCategoria", "IdpptoFase", "Descripcion") values ('E2E-OPS-C1', 'E2E-OPS-F1', 'E2E MUROS'), ('E2E-OPS-C2', 'E2E-OPS-F1', 'E2E PISOS')`);
    idPresupuesto = (await db.query(`insert into "ppto_Principal" ("IdPresupuesto", "Version", "TipoPpto", "Estado", id_centro_costo) values ('E2E-OPS-PPTO', 'V1', 'Principal', 'Aprobado', $1) returning id`, [cc2])).rows[0].id;
    await db.query(`insert into "ppto_DetalleFases" ("IdPresupuestoDetalle", "IdPresupuesto", id_centro_costo, "IdpptoFase") values ('E2E-OPS-DF1', 'E2E-OPS-PPTO', $1, 'E2E-OPS-F1')`, [cc2]);
    await db.query(
      `insert into "ppto_DetalleFasesCate" ("IdPresupuestoDetalleCategoria", "IdPresupuesto", "IdPresupuestoDetalle", id_centro_costo, "IdpptoFase", "IdpptoFaseCategoria")
       values ('E2E-OPS-DC1', 'E2E-OPS-PPTO', 'E2E-OPS-DF1', $1, 'E2E-OPS-F1', 'E2E-OPS-C1'), ('E2E-OPS-DC2', 'E2E-OPS-PPTO', 'E2E-OPS-DF1', $1, 'E2E-OPS-F1', 'E2E-OPS-C2')`,
      [cc2],
    );

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    if (db) {
      // Las tablas obra_* se borran en cascada con el centro de costo.
      await db.query(`delete from "ppto_Principal" where "IdPresupuesto" = 'E2E-OPS-PPTO'`); // sus fases y categorías, en cascada
      await db.query(`delete from "ppto_Fases" where "IdpptoFase" = 'E2E-OPS-F1'`); // sus categorías, en cascada
      await db.query(`delete from "CentroCostos" where centro_costo like 'E2E-OPS-%'`);
      await db.query(`delete from anexos where "Anexo" like 'E2E-OPS %'`);
      await borrarUsuarioE2E(db);
      await db.end();
    }
    await app?.close();
  });

  // ─── Ficha y estado ───────────────────────────────────────────────────────────
  describe('ficha operativa y estado', () => {
    it('una obra sin estado no está configurada y el motor no calcula nada', async () => {
      const res = await api().get(`${base()}/control`).expect(200);
      expect(res.body).toMatchObject({ configurada: false, estado_obra: null, resultado: null });
      expect(res.body.faltantes).toContain('estado_obra');
    });

    it('no se puede iniciar el control con la ficha incompleta (RV-01…03)', async () => {
      const res = await api().post(`${base()}/estado`).send({ estado: 'EN_EJECUCION' }).expect(400);
      expect(JSON.stringify(res.body.message)).toMatch(/código de obra.*tienda/s);
    });

    it('el centro de costo debe tener cliente para entrar al control (RV-01)', async () => {
      const sinCliente = (await db.query(`insert into "CentroCostos" (centro_costo, estado, fecha_inicio, fecha_fin_prog) values ('E2E-OPS-3', 'ABIERTO', $1, $2) returning id`, [inicio, fin])).rows[0].id;
      await api().patch(`/operaciones/obra/${sinCliente}/generales`).send({ codigo_obra: 'E2E-OPS-003', tienda: 'T3', departamento: 'Lima', id_jefe_proyecto: jefe }).expect(200);
      const res = await api().post(`/operaciones/obra/${sinCliente}/estado`).send({ estado: 'EN_EJECUCION' }).expect(400);
      expect(JSON.stringify(res.body.message)).toMatch(/cliente del centro de costo/);
    });

    it('rechaza como equipo a quien no sea un Trabajador', async () => {
      await api().patch(`${base()}/generales`).send({ id_jefe_proyecto: proveedor }).expect(400);
      await api().patch(`${base()}/generales`).send({ id_jefe_proyecto: 999999999 }).expect(400);
    });

    it('guarda la ficha: el código se pasa a mayúsculas, el equipo muestra sus nombres y queda en el historial', async () => {
      const res = await api()
        .patch(`${base()}/generales`)
        .send({ codigo_obra: 'e2e-ops-001', tienda: 'Tienda E2E', departamento: 'Lima', id_jefe_proyecto: jefe, id_coordinador: coordinador, comentario: 'Obra de prueba' })
        .expect(200);
      expect(res.body).toMatchObject({ codigo_obra: 'E2E-OPS-001', tienda: 'Tienda E2E', comentario: 'Obra de prueba' });
      expect(res.body.equipo.jefe_proyecto).toEqual({ id: jefe, nombre: 'E2E-OPS Jefe de proyecto' });
      expect(res.body.equipo.coordinador.nombre).toBe('E2E-OPS Coordinador');
      expect(res.body.equipo.residente).toBeNull();
    });

    it('el código de obra es único (409)', async () => {
      await api().patch(`/operaciones/obra/${cc2}/generales`).send({ codigo_obra: 'E2E-OPS-001' }).expect(409);
    });

    it('el fin no puede ser anterior al inicio', async () => {
      await api().patch(`${base()}/generales`).send({ fecha_fin_prog: deDia(w1 - 5) }).expect(400);
    });

    it('incorpora la obra al control (EN_EJECUCION) y no admite repetir el estado ni saltos inválidos', async () => {
      const res = await api().post(`${base()}/estado`).send({ estado: 'EN_EJECUCION' }).expect(201);
      expect(res.body).toMatchObject({ anterior: null, estado: 'EN_EJECUCION' });
      await api().post(`${base()}/estado`).send({ estado: 'EN_EJECUCION' }).expect(409);
      await api().post(`${base()}/estado`).send({ estado: 'CULMINADO' }).expect(409);
    });

    it('con estado y fechas la obra queda configurada, pero sin partidas ni avance', async () => {
      const res = await api().get(`${base()}/control`).expect(200);
      expect(res.body).toMatchObject({ configurada: true, faltantes: [], estado_obra: 'EN_EJECUCION' });
      expect(res.body.resultado).toMatchObject({ sinPartidas: true, estadoEfectivo: 'EN_EJECUCION' });
      expect(res.body.resultado.semana.actual).toBe(3);
    });
  });

  // ─── Estructura y metas ───────────────────────────────────────────────────────
  describe('partidas, subpartidas y metas', () => {
    it('crea una partida; el ítem es único por obra', async () => {
      const res = await api().post(`${base()}/partidas`).send({ item: '01', nombre: 'Obras civiles' }).expect(201);
      idPartida = res.body.id;
      expect(res.body).toMatchObject({ item: '01', tipo: 'CONTRACTUAL', subpartidas: [] });
      await api().post(`${base()}/partidas`).send({ item: '01', nombre: 'Otra' }).expect(409);
    });

    it('rechaza una subpartida con el fin antes del inicio (RV-06)', async () => {
      await api().post(`${base()}/partidas/${idPartida}/subpartidas`).send({ item: '01.01', nombre: 'X', fecha_inicio: finSub, fecha_fin: inicio }).expect(400);
    });

    it('crea la subpartida A (12 días laborables) y hereda el tipo de su partida', async () => {
      const res = await api()
        .post(`${base()}/partidas/${idPartida}/subpartidas`)
        .send({ item: '01.01', nombre: 'Tabiquería', fecha_inicio: inicio, fecha_fin: finSub })
        .expect(201);
      idSub = res.body.id;
      expect(res.body).toMatchObject({ item: '01.01', tipo: 'CONTRACTUAL', tipo_propio: null, tiene_avance: false });
      expect(res.body.metas_manuales).toEqual(Array(10).fill(null));
      await api().post(`${base()}/partidas/${idPartida}/subpartidas`).send({ item: '01.01', nombre: 'Repetida', fecha_inicio: inicio, fecha_fin: finSub }).expect(409);
    });

    it('una subpartida de otra obra no es accesible desde esta', async () => {
      const otra = await api().post(`/operaciones/obra/${cc2}/partidas`).send({ item: '90', nombre: 'Ajena' }).expect(201);
      const s = await api().post(`/operaciones/obra/${cc2}/partidas/${otra.body.id}/subpartidas`).send({ item: '90.01', nombre: 'Ajena', fecha_inicio: inicio, fecha_fin: finSub }).expect(201);
      idSubAjena = s.body.id;
      await api().patch(`${base()}/subpartidas/${idSubAjena}`).send({ nombre: 'x' }).expect(404);
      await api().delete(`${base()}/subpartidas/${idSubAjena}`).expect(404);
    });

    it('las metas deben ser de 0 a 100 y solo hay 10 semanas', async () => {
      await api().put(`${base()}/subpartidas/${idSub}/metas`).send({ metas: [150] }).expect(400);
      await api().put(`${base()}/subpartidas/${idSub}/metas`).send({ metas: Array(11).fill(1) }).expect(400);
    });

    it('fija metas manuales y vuelve al reparto automático con null', async () => {
      const a = await api().put(`${base()}/subpartidas/${idSub}/metas`).send({ metas: [60, 40] }).expect(200);
      expect(a.body.metas_manuales.slice(0, 3)).toEqual([60, 40, null]);
      const b = await api().put(`${base()}/subpartidas/${idSub}/metas`).send({ metas: [] }).expect(200);
      expect(b.body.metas_manuales).toEqual(Array(10).fill(null));
    });

    it('sin avance, la semana 2 ya cerró y el plan pedía 100 %: la obra está Retrasada', async () => {
      const c = (await api().get(`${base()}/control`).expect(200)).body.resultado;
      expect(c).toMatchObject({ sinPartidas: false, sinAvance: true, real: 0, situacion: { texto: 'Retrasada' } });
      expect(c.programado).toBeCloseTo(100, 6);
      expect(c.partidas[0].subpartidas[0]).toMatchObject({ item: '01.01', diasLaborables: 12, peso: 12 });
      expect(c.partidas[0].subpartidas[0].metas.slice(0, 2)).toEqual([50, 50]);
    });
  });

  // ─── Avance semanal ───────────────────────────────────────────────────────────
  describe('avance semanal', () => {
    it('la grilla trae las 16 semanas, las metas efectivas y la semana en curso', async () => {
      const res = (await api().get(`${base()}/avance`).expect(200)).body;
      expect(res.semana_en_curso).toBe(3);
      expect(res.inicio_semana_1).toBe(inicio);
      expect(res.semanas).toHaveLength(16);
      expect(res.semanas[2]).toMatchObject({ numero: 3, en_curso: true, futura: false });
      expect(res.semanas[3]).toMatchObject({ numero: 4, futura: true });
      expect(res.subpartidas[0]).toMatchObject({ id: idSub, item: '01.01', real_acumulado: 0 });
      expect(res.subpartidas[0].metas.slice(0, 2)).toEqual([50, 50]);
    });

    it('rechaza semanas fuera de rango o futuras (RV-10)', async () => {
      const linea = { lineas: [{ idSubpartida: idSub, avance: 10 }] };
      await api().put(`${base()}/avance/semanas/0`).send(linea).expect(400);
      await api().put(`${base()}/avance/semanas/17`).send(linea).expect(400);
      await api().put(`${base()}/avance/semanas/4`).send(linea).expect(400);
    });

    it('valida el valor: 0-100, no menor a 1 (RV-09), subpartida de la obra y sin repetidos', async () => {
      const put = (lineas: unknown[]) => api().put(`${base()}/avance/semanas/1`).send({ lineas });
      await put([{ idSubpartida: idSub, avance: 101 }]).expect(400);
      await put([{ idSubpartida: idSub, avance: -1 }]).expect(400);
      await put([{ idSubpartida: idSub, avance: 0.5 }]).expect(400);
      await put([{ idSubpartida: idSubAjena, avance: 10 }]).expect(400);
      await put([{ idSubpartida: idSub, avance: 10 }, { idSubpartida: idSub, avance: 20 }]).expect(400);
      await put([]).expect(400);
    });

    it('registra la semana 1 (50 %) y devuelve el real antes y después', async () => {
      const res = await api().put(`${base()}/avance/semanas/1`).send({ lineas: [{ idSubpartida: idSub, avance: 50 }] }).expect(200);
      expect(res.body).toEqual({ semana: 1, lineas: 1, real_antes: 0, real_despues: 50 });
    });

    it('el avance acumulado de una subpartida no puede pasar de 100 (RV-07)', async () => {
      await api().put(`${base()}/avance/semanas/2`).send({ lineas: [{ idSubpartida: idSub, avance: 60 }] }).expect(400);
    });

    it('no se puede entregar al 50 % sin confirmar (RV-17)', async () => {
      const res = await api().post(`${base()}/estado`).send({ estado: 'POST_VENTA' }).expect(409);
      expect(res.body.message).toMatch(/50 %/);
    });

    it('con 50 % real y 100 % pedido la obra sigue Retrasada y tiene días de retraso', async () => {
      const c = (await api().get(`${base()}/control`).expect(200)).body.resultado;
      expect(c.real).toBe(50);
      expect(c.situacion.texto).toBe('Retrasada');
      expect(c.desviacion).toBeCloseTo(-50, 6);
      expect(c.plazos.diasRetraso).toBeGreaterThan(0);
    });

    it('no se puede eliminar una subpartida con avance (409)', async () => {
      await api().delete(`${base()}/subpartidas/${idSub}`).expect(409);
      await api().delete(`${base()}/partidas/${idPartida}`).expect(409);
    });

    it('completa la semana 2 y la obra queda «Por entregar» al 100 %', async () => {
      const res = await api().put(`${base()}/avance/semanas/2`).send({ lineas: [{ idSubpartida: idSub, avance: 50 }] }).expect(200);
      expect(res.body).toMatchObject({ real_antes: 50, real_despues: 100 });
      const c = (await api().get(`${base()}/control`).expect(200)).body.resultado;
      expect(c).toMatchObject({ real: 100, situacion: { texto: 'Por entregar' } });
    });

    it('vaciar un avance (null) lo borra y baja el real', async () => {
      await api().put(`${base()}/avance/semanas/2`).send({ lineas: [{ idSubpartida: idSub, avance: null }] }).expect(200);
      expect((await api().get(`${base()}/control`).expect(200)).body.resultado.real).toBe(50);
      await api().put(`${base()}/avance/semanas/2`).send({ lineas: [{ idSubpartida: idSub, avance: 50 }] }).expect(200);
    });

    it('el Cockpit toma el avance del motor, no de la bitácora semanal', async () => {
      const k = (await api().get(`${base()}/cockpit`).expect(200)).body.kpis;
      expect(k.avance_real_global).toBe(100);
      expect(k.semana_activa).toBe(3);
    });

    it('?hoy= consulta el control como estaba en otra fecha (solo lectura)', async () => {
      const r = (await api().get(`${base()}/control?hoy=${deDia(w1 + 3)}`).expect(200)).body;
      expect(r.hoy).toBe(deDia(w1 + 3));
      expect(r.resultado.semana.actual).toBe(1);
      await api().get(`${base()}/control?hoy=2026-13-45`).expect(400);
      await api().get(`${base()}/control?hoy=hoy`).expect(400);
    });

    it('Curva S: el filtro de adicionales no tiene datos si no hay adicionales', async () => {
      const todo = (await api().get(`${base()}/control/curva-s`).expect(200)).body;
      expect(todo.semanas.length).toBeGreaterThanOrEqual(5);
      expect(todo.semanas[1].real).toBe(100);
      const adic = await api().get(`${base()}/control/curva-s?tipo=A`).expect(200);
      expect(adic.body).toEqual({});
      await api().get(`${base()}/control/curva-s?tipo=Z`).expect(400);
    });
  });

  // ─── Reprogramaciones ─────────────────────────────────────────────────────────
  describe('reprogramaciones', () => {
    let externa = 0;
    let interna = 0;

    it('valida días (1-60), motivo y que no empiece antes del inicio (RV-23)', async () => {
      const post = (b: object) => api().post(`${base()}/reprogramaciones`).send(b);
      await post({ desde: hoy, dias: 0, motivo: 'CLIENTE' }).expect(400);
      await post({ desde: hoy, dias: 61, motivo: 'CLIENTE' }).expect(400);
      await post({ desde: hoy, dias: 7, motivo: 'OTRO' }).expect(400);
      await post({ desde: deDia(w1 - 10), dias: 7, motivo: 'CLIENTE' }).expect(400);
      await post({ desde: '2026-02-30', dias: 7, motivo: 'CLIENTE' }).expect(400);
    });

    it('causa externa: sube el fin vigente y el de control, y no es atraso', async () => {
      const res = await api().post(`${base()}/reprogramaciones`).send({ desde: deDia(w1 + 20), dias: 7, motivo: 'CLIENTE', detalle: 'El cliente aplaza' }).expect(201);
      externa = res.body.id;
      expect(res.body).toMatchObject({ dias: 7, motivo: 'CLIENTE', es_atraso: false });
      const p = (await api().get(`${base()}/control`).expect(200)).body.resultado.plazos;
      expect(p).toMatchObject({ finOriginal: fin, finVigente: deDia(aDia(fin) + 7), finControl: deDia(aDia(fin) + 7), diasExternos: 7, diasInternos: 0 });
    });

    it('causa interna: sube el fin vigente pero NO el de control', async () => {
      const res = await api().post(`${base()}/reprogramaciones`).send({ desde: deDia(w1 + 25), dias: 3, motivo: 'INTERNO' }).expect(201);
      interna = res.body.id;
      expect(res.body.es_atraso).toBe(true);
      const p = (await api().get(`${base()}/control`).expect(200)).body.resultado.plazos;
      expect(p).toMatchObject({ finVigente: deDia(aDia(fin) + 10), finControl: deDia(aDia(fin) + 7), diasReprogramados: 10, diasInternos: 3 });
    });

    it('las fechas de las subpartidas no cambian', async () => {
      const s = (await api().get(`${base()}/partidas`).expect(200)).body[0].subpartidas[0];
      expect(s).toMatchObject({ fecha_inicio: inicio, fecha_fin: finSub });
    });

    it('corrige y elimina; el fin vigente vuelve al original', async () => {
      const m = await api().patch(`${base()}/reprogramaciones/${externa}`).send({ dias: 5 }).expect(200);
      expect(m.body.dias).toBe(5);
      await api().delete(`${base()}/reprogramaciones/${externa}`).expect(200);
      await api().delete(`${base()}/reprogramaciones/${interna}`).expect(200);
      await api().delete(`${base()}/reprogramaciones/${interna}`).expect(404);
      const p = (await api().get(`${base()}/control`).expect(200)).body.resultado.plazos;
      expect(p).toMatchObject({ finVigente: fin, diasReprogramados: 0 });
    });
  });

  // ─── Incidencias ──────────────────────────────────────────────────────────────
  describe('incidencias vinculadas a una subpartida', () => {
    it('solo acepta subpartidas de la misma obra', async () => {
      await api().post(`${base()}/incidencias`).send({ titulo: 'Falta material', descripcion: 'Drywall', id_subpartida: idSubAjena }).expect(400);
    });

    it('guarda y devuelve el vínculo (motivo del retraso)', async () => {
      const res = await api().post(`${base()}/incidencias`).send({ titulo: 'Falta material', descripcion: 'Drywall', id_subpartida: idSub }).expect(201);
      expect(res.body.id_subpartida).toBe(idSub);
      const c = (await api().get(`${base()}/cockpit`).expect(200)).body;
      expect(c.incidencias[0].id_subpartida).toBe(idSub);
    });
  });

  // ─── Importar desde el presupuesto ────────────────────────────────────────────
  describe('importar la estructura del presupuesto', () => {
    const base2 = () => `/operaciones/obra/${cc2}`;

    it('lista las versiones de presupuesto de la obra', async () => {
      const res = (await api().get(`${base2()}/presupuestos-disponibles`).expect(200)).body;
      expect(res).toHaveLength(1);
      expect(res[0]).toMatchObject({ id: idPresupuesto, id_presupuesto: 'E2E-OPS-PPTO', version: 'V1', fases: 1, categorias: 2 });
    });

    it('no importa el presupuesto de otra obra', async () => {
      await api().post(`${base()}/partidas/importar-presupuesto`).send({ idPresupuesto }).expect(400);
    });

    it('fase → partida y categoría → subpartida, con ítems generados y las fechas de la obra (reemplaza la estructura previa)', async () => {
      // la obra ya tiene la partida «90»: sin reemplazar no se importa
      await api().post(`${base2()}/partidas/importar-presupuesto`).send({ idPresupuesto }).expect(409);
      const res = await api().post(`${base2()}/partidas/importar-presupuesto`).send({ idPresupuesto, reemplazar: true }).expect(201);
      expect(res.body).toMatchObject({ partidas: 1, subpartidas: 2 });
      const [p] = res.body.estructura;
      expect(p).toMatchObject({ item: '01', nombre: 'E2E FASE ARQUITECTURA' });
      expect(p.subpartidas.map((s: { item: string; nombre: string; fecha_inicio: string; fecha_fin: string }) => [s.item, s.nombre, s.fecha_inicio, s.fecha_fin])).toEqual([
        ['01.01', 'E2E MUROS', inicio, fin],
        ['01.02', 'E2E PISOS', inicio, fin],
      ]);
    });

    it('con avance registrado ya no se puede reemplazar la estructura', async () => {
      // pone la obra en ejecución, registra avance y comprueba que protege los datos
      await api().patch(`${base2()}/generales`).send({ codigo_obra: 'E2E-OPS-002', tienda: 'T2', departamento: 'Lima', id_jefe_proyecto: jefe }).expect(200);
      await api().post(`${base2()}/estado`).send({ estado: 'EN_EJECUCION' }).expect(201);
      const sub = (await api().get(`${base2()}/partidas`).expect(200)).body[0].subpartidas[0].id;
      await api().put(`${base2()}/avance/semanas/1`).send({ lineas: [{ idSubpartida: sub, avance: 10 }] }).expect(200);
      await api().post(`${base2()}/partidas/importar-presupuesto`).send({ idPresupuesto, reemplazar: true }).expect(409);
    });
  });

  // ─── Cierre del ciclo ─────────────────────────────────────────────────────────
  describe('entrega y cierre', () => {
    it('entrega al 100 %: fija la entrega real en el centro de costo y la obra pasa a «Entregada»', async () => {
      const res = await api().post(`${base()}/estado`).send({ estado: 'POST_VENTA', observaciones: 'Pendiente luminarias' }).expect(201);
      expect(res.body).toMatchObject({ anterior: 'EN_EJECUCION', estado: 'POST_VENTA', fecha: hoy });
      const fila = (await db.query(`select fecha_fin_real::text as f from "CentroCostos" where id = $1`, [cc])).rows[0];
      expect(fila.f.slice(0, 10)).toBe(hoy);
      const r = (await api().get(`${base()}/control`).expect(200)).body.resultado;
      expect(r.situacion.texto).toBe('Entregada');
      expect(r.postVenta).toMatchObject({ inicio: hoy, cerrada: false, texto: 'En curso' });
    });

    it('no se puede registrar avance en una obra ya entregada', async () => {
      await api().put(`${base()}/avance/semanas/3`).send({ lineas: [{ idSubpartida: idSub, avance: 0 }] }).expect(409);
    });

    it('el cierre no puede ser anterior a la entrega (RV-20) y deja la obra Culminada', async () => {
      await api().post(`${base()}/estado`).send({ estado: 'CULMINADO', fecha: deDia(aDia(hoy) - 2) }).expect(400);
      await api().post(`${base()}/estado`).send({ estado: 'CULMINADO', fecha: hoy }).expect(201);
      const r = (await api().get(`${base()}/control`).expect(200)).body.resultado;
      expect(r.postVenta).toMatchObject({ cerrada: true });
      await api().post(`${base()}/estado`).send({ estado: 'EN_EJECUCION' }).expect(409); // culminada es un estado final
    });
  });

  // ─── Historial ────────────────────────────────────────────────────────────────
  describe('historial de la obra', () => {
    it('cada cambio dejó su evento, del más reciente al más antiguo', async () => {
      const eventos = (await api().get(`${base()}/eventos`).expect(200)).body as { id: number; tipo: string; titulo: string; usuario: string | null; valor_antes: string | null; valor_despues: string | null }[];
      const tipos = new Set(eventos.map((e) => e.tipo));
      for (const t of ['ALTA', 'ESTADO', 'AVANCE', 'EQUIPO', 'REPROGRAMACION']) expect(tipos.has(t), t).toBe(true);
      const ids = eventos.map((e) => e.id);
      expect(ids).toEqual([...ids].sort((a, b) => b - a));
      // Los avisos del sistema (usuario null) los puede generar el portafolio en paralelo: aquí interesa lo que hizo una persona.
      expect(eventos.find((e) => e.usuario !== null)!.titulo).toMatch(/Culminado/);
      const avance = eventos.find((e) => e.tipo === 'AVANCE' && e.valor_antes === '0%');
      expect(avance).toMatchObject({ valor_antes: '0%', valor_despues: '50%', usuario: 'E2E-ADMIN' });
    });

    it('el límite del historial se respeta', async () => {
      const lista = (await api().get(`${base()}/eventos?limite=2`).expect(200)).body;
      expect(lista).toHaveLength(2);
      await api().get(`${base()}/eventos?limite=0`).expect(400);
      await api().get(`${base()}/eventos?limite=500`).expect(400);
    });

    it('una obra inexistente responde 404 en todas las lecturas', async () => {
      for (const ruta of ['control', 'partidas', 'avance', 'reprogramaciones', 'eventos', 'presupuestos-disponibles']) {
        const r = await api().get(`/operaciones/obra/999999999/${ruta}`);
        expect([404, 400], ruta).toContain(r.status);
      }
    });
  });
});
