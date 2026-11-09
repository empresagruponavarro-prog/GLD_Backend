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
 * GRP, fase F4, contra la BD de DATABASE_URL: catálogos de proyecto, directorio con historial, lista de planos y
 * liquidación. Crea sus propios datos (`E2E-LIQ-*`) y los elimina al final. Debe correr en serie con los demás e2e de
 * operaciones (comparten el usuario E2E-ADMIN).
 */
describe('Catálogos, directorio, planos y liquidación (e2e)', () => {
  let app: INestApplication<App>;
  let db: pg.Client;

  const hoy = hoyLima();
  const w1 = lunesDe(aDia(hoy)) - 14; // la obra empezó hace dos semanas
  const inicio = deDia(w1);
  const fin = deDia(w1 + 33);

  let cliente = 0;
  let ana = 0;
  let beto = 0;
  let carla = 0;
  let cc = 0;
  let tipoA = 0;
  let tipoB = 0;
  let p1 = 0; // plano obligatorio
  let p2 = 0; // plano obligatorio
  let p3 = 0; // plano opcional
  let idSub = 0;
  const api = () => apiConSesion(app);
  const obra = () => `/operaciones/obra/${cc}`;

  const anexo = async (nombre: string, tipo: string) =>
    (await db.query(`insert into anexos ("tipoAnexo", "Anexo", estado) values ($1, $2, true) returning id`, [tipo, nombre])).rows[0].id as number;
  const ccFila = async () =>
    (await db.query(`select estado, fecha_fin_real::text fin_real, fecha_liquidacion::text liq, liquidado_por, presupuesto_estado from "CentroCostos" where id = $1`, [cc])).rows[0] as {
      estado: string;
      fin_real: string | null;
      liq: string | null;
      liquidado_por: string | null;
      presupuesto_estado: string | null;
    };
  const pptoEstado = async (codigo: string) => (await db.query(`select estado_ppto, "Estado" legado from "ppto_Principal" where "IdPresupuesto" = $1`, [codigo])).rows[0] as { estado_ppto: string; legado: string };

  beforeAll(async () => {
    db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
    await db.connect();
    await crearUsuarioE2E(db);
    cliente = await anexo('E2E-LIQ Cliente', 'Cliente');
    ana = await anexo('E2E-LIQ Ana', 'Trabajador');
    beto = await anexo('E2E-LIQ Beto', 'Trabajador');
    carla = await anexo('E2E-LIQ Carla', 'Trabajador');
    cc = (
      await db.query(`insert into "CentroCostos" (centro_costo, estado, fecha_inicio, fecha_fin_prog, periodo, id_anexo) values ('E2E-LIQ-OBRA', 'ABIERTO', $1, $2, 2026, $3) returning id`, [inicio, fin, cliente])
    ).rows[0].id;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    if (db) {
      // `id_centro_costo` de los presupuestos es SET NULL: se borran antes que el centro de costo.
      await db.query(`delete from "ppto_Principal" where id_centro_costo in (select id from "CentroCostos" where centro_costo like 'E2E-LIQ-%')`);
      await db.query(`delete from "CentroCostos" where centro_costo like 'E2E-LIQ-%'`); // obra_* y la lista de planos, en cascada
      await db.query(`delete from tipo_proyecto where nombre like 'E2E-LIQ-%'`); // sus planos, en cascada
      await db.query(`delete from tipo_plano where codigo like 'E2E-LIQ-%'`);
      await db.query(`delete from periodo_fiscal where anio = 2099`);
      await db.query(`delete from anexos where "Anexo" like 'E2E-LIQ %'`);
      await borrarUsuarioE2E(db);
      await db.end();
    }
    await app?.close();
  });

  // ─── Catálogos ────────────────────────────────────────────────────────────────
  describe('catálogos de proyecto', () => {
    it('los tipos de plano se guardan en mayúsculas y el código no se repite', async () => {
      const crear = (codigo: string, nombre: string) => api().post('/proyectos/catalogos/tipos-plano').send({ codigo, nombre, disciplina: 'arquitectura' });
      const a = (await crear('e2e-liq-p1', 'Planta general').expect(201)).body;
      p1 = a.id;
      expect(a).toMatchObject({ codigo: 'E2E-LIQ-P1', nombre: 'PLANTA GENERAL', disciplina: 'ARQUITECTURA', activo: true });
      p2 = (await crear('E2E-LIQ-P2', 'Cortes').expect(201)).body.id;
      p3 = (await crear('E2E-LIQ-P3', 'Detalles').expect(201)).body.id;
      await crear('E2E-LIQ-P1', 'Repetido').expect(409);
    });

    it('un tipo de proyecto lleva la lista de planos que exige, sin repetir y solo con planos que existen', async () => {
      tipoA = (await api().post('/proyectos/catalogos/tipos-proyecto').send({ nombre: 'e2e-liq-tipo a' }).expect(201)).body.id;
      tipoB = (await api().post('/proyectos/catalogos/tipos-proyecto').send({ nombre: 'E2E-LIQ-TIPO B' }).expect(201)).body.id;
      await api().post('/proyectos/catalogos/tipos-proyecto').send({ nombre: 'E2E-LIQ-TIPO A' }).expect(409);

      await api().put(`/proyectos/catalogos/tipos-proyecto/${tipoA}/planos`).send({ planos: [{ id_tipo_plano: p1 }, { id_tipo_plano: p1 }] }).expect(400);
      await api().put(`/proyectos/catalogos/tipos-proyecto/${tipoA}/planos`).send({ planos: [{ id_tipo_plano: 999999999 }] }).expect(400);
      const res = await api()
        .put(`/proyectos/catalogos/tipos-proyecto/${tipoA}/planos`)
        .send({ planos: [{ id_tipo_plano: p1 }, { id_tipo_plano: p2, obligatorio: true }, { id_tipo_plano: p3, obligatorio: false }] })
        .expect(200);
      expect(res.body.nombre).toBe('E2E-LIQ-TIPO A');
      expect(res.body.planos.map((p: { codigo: string; obligatorio: boolean }) => [p.codigo, p.obligatorio])).toEqual([['E2E-LIQ-P1', true], ['E2E-LIQ-P2', true], ['E2E-LIQ-P3', false]]);

      await api().put(`/proyectos/catalogos/tipos-proyecto/${tipoB}/planos`).send({ planos: [{ id_tipo_plano: p3 }] }).expect(200);
    });

    it('los tipos activos se leen desde cualquier pantalla y los años fiscales se crean y se activan', async () => {
      const activos = (await api().get('/proyectos/catalogos/tipos-proyecto?activos=true').expect(200)).body as { nombre: string }[];
      expect(activos.map((t) => t.nombre)).toEqual(expect.arrayContaining(['E2E-LIQ-TIPO A', 'E2E-LIQ-TIPO B']));
      const anios = (await api().get('/proyectos/catalogos/periodos').expect(200)).body as { anio: number; activo: boolean }[];
      expect(anios.filter((a) => a.anio >= 2024 && a.anio <= 2027).every((a) => a.activo)).toBe(true);
      expect((await api().put('/proyectos/catalogos/periodos/2099').send({ activo: true }).expect(200)).body).toEqual({ anio: 2099, activo: true });
      await api().put('/proyectos/catalogos/periodos/2099').send({ activo: false }).expect(200);
      expect(((await api().get('/proyectos/catalogos/periodos?activos=true').expect(200)).body as { anio: number }[]).some((a) => a.anio === 2099)).toBe(false);
      await api().put('/proyectos/catalogos/periodos/1500').send({ activo: true }).expect(400);
    });
  });

  // ─── Directorio con historial ────────────────────────────────────────────────
  describe('directorio del equipo', () => {
    const tarjetas = async () => (await api().get(`${obra()}/residentes`).expect(200)).body as { clave: string; origen: string; id_anexo?: number; rol_obra: string; fecha_alta?: string; telefono?: string }[];
    const historial = async () => (await api().get(`${obra()}/residentes/historial`).expect(200)).body as { clave: string; origen: string; id: number; id_anexo?: number; rol_obra: string; fecha_alta?: string; fecha_baja?: string }[];

    it('una persona con dos roles aparece dos veces, con el «desde» de cada rol', async () => {
      await api().patch(`${obra()}/generales`).send({ id_distrito: '150101', id_jefe_proyecto: ana, id_residente: ana }).expect(200);
      const t = await tarjetas();
      expect(t.map((x) => [x.clave, x.rol_obra])).toEqual([[`equipo-${ana}-jefe_proyecto`, 'Jefe de proyecto'], [`equipo-${ana}-residente`, 'Residente']]);
      expect(t.every((x) => x.origen === 'equipo' && x.fecha_alta === hoy)).toBe(true);
      expect(await historial()).toEqual([]);
    });

    it('al cambiar a quien ocupa un rol, el anterior queda en el historial con su baja', async () => {
      await api().patch(`${obra()}/generales`).send({ id_residente: beto }).expect(200);
      const t = await tarjetas();
      expect(t.map((x) => [x.id_anexo, x.rol_obra])).toEqual([[ana, 'Jefe de proyecto'], [beto, 'Residente']]);
      const h = await historial();
      expect(h).toHaveLength(1);
      expect(h[0]).toMatchObject({ origen: 'historial', id_anexo: ana, rol_obra: 'Residente', fecha_alta: hoy, fecha_baja: hoy });

      // Un segundo cambio suma al historial; el más reciente va primero.
      await api().patch(`${obra()}/generales`).send({ id_coordinador: carla }).expect(200);
      await api().patch(`${obra()}/generales`).send({ id_coordinador: ana }).expect(200);
      const h2 = await historial();
      expect(h2.map((x) => [x.id_anexo, x.rol_obra])).toEqual([[carla, 'Coordinador'], [ana, 'Residente']]);
      const vigentes = await tarjetas();
      expect(vigentes.map((x) => [x.id_anexo, x.rol_obra])).toEqual([[ana, 'Jefe de proyecto'], [ana, 'Coordinador'], [beto, 'Residente']]);
    });

    it('reenviar el mismo equipo no genera historial', async () => {
      await api().patch(`${obra()}/generales`).send({ id_jefe_proyecto: ana, id_residente: beto, id_coordinador: ana }).expect(200);
      expect(await historial()).toHaveLength(2);
    });

    it('los datos de obra de una persona valen para todas sus tarjetas', async () => {
      await api().put(`${obra()}/residentes/equipo/${ana}`).send({ telefono: '911222333' }).expect(200);
      const t = (await tarjetas()).filter((x) => x.id_anexo === ana);
      expect(t).toHaveLength(2);
      expect(t.every((x) => x.telefono === '911222333')).toBe(true);
    });

    it('un registro del historial no se edita ni se elimina', async () => {
      const [h] = await historial();
      await api().patch(`${obra()}/residentes/${h.id}`).send({ turno: 'Noche' }).expect(400);
      await api().delete(`${obra()}/residentes/${h.id}`).expect(400);
      expect(await historial()).toHaveLength(2);
    });
  });

  // ─── Lista de verificación de planos ─────────────────────────────────────────
  describe('planos de la obra', () => {
    const lista = async () => (await api().get(`${obra()}/planos-requeridos`).expect(200)).body;

    it('sin tipo de proyecto no hay planos que exigir', async () => {
      const l = await lista();
      expect(l).toMatchObject({ id_tipo_proyecto: null, tipo_proyecto: null, items: [] });
      expect(l.resumen.completo).toBe(true);
    });

    it('asignar el tipo de proyecto copia su lista a la obra', async () => {
      const res = await api().patch(`/centros-costos/${cc}`).send({ id_tipo_proyecto: tipoA }).expect(200);
      expect(res.body.id_tipo_proyecto).toBe(tipoA);
      const l = await lista();
      expect(l.tipo_proyecto).toBe('E2E-LIQ-TIPO A');
      expect(l.items.map((i: { codigo: string; obligatorio: boolean; entregado: boolean }) => [i.codigo, i.obligatorio, i.entregado])).toEqual([
        ['E2E-LIQ-P1', true, false],
        ['E2E-LIQ-P2', true, false],
        ['E2E-LIQ-P3', false, false],
      ]);
      expect(l.resumen).toMatchObject({ obligatorios: 2, entregados_obligatorios: 0, completo: false });
    });

    it('un tipo inexistente o inactivo se rechaza', async () => {
      await api().patch(`/centros-costos/${cc}`).send({ id_tipo_proyecto: 999999999 }).expect(400);
      await api().patch(`/proyectos/catalogos/tipos-proyecto/${tipoB}`).send({ activo: false }).expect(200);
      await api().patch(`/centros-costos/${cc}`).send({ id_tipo_proyecto: tipoB }).expect(400);
      await api().patch(`/proyectos/catalogos/tipos-proyecto/${tipoB}`).send({ activo: true }).expect(200);
    });

    it('el check de entregado guarda quién y cuándo', async () => {
      const res = await api().put(`${obra()}/planos-requeridos/${p1}`).send({ entregado: true }).expect(200);
      const item = res.body.items.find((i: { id_tipo_plano: number }) => i.id_tipo_plano === p1);
      expect(item).toMatchObject({ entregado: true, entregado_por: 'e2e-admin' });
      expect(item.entregado_en).not.toBeNull();
      expect(res.body.resumen).toMatchObject({ entregados_obligatorios: 1, completo: false });
      await api().put(`${obra()}/planos-requeridos/999999999`).send({ entregado: true }).expect(404);
    });

    it('al cambiar de tipo conserva lo entregado y quita lo que ya no se pide y no estaba entregado', async () => {
      await api().patch(`/centros-costos/${cc}`).send({ id_tipo_proyecto: tipoB }).expect(200); // B solo pide P3
      let l = await lista();
      expect(l.items.map((i: { codigo: string; entregado: boolean }) => [i.codigo, i.entregado])).toEqual([['E2E-LIQ-P1', true], ['E2E-LIQ-P3', false]]);
      await api().patch(`/centros-costos/${cc}`).send({ id_tipo_proyecto: tipoA }).expect(200);
      l = await lista();
      expect(l.items.map((i: { codigo: string; entregado: boolean }) => [i.codigo, i.entregado])).toEqual([['E2E-LIQ-P1', true], ['E2E-LIQ-P2', false], ['E2E-LIQ-P3', false]]);
    });

    it('un tipo de proyecto o un plano en uso no se elimina', async () => {
      await api().delete(`/proyectos/catalogos/tipos-proyecto/${tipoA}`).expect(409);
      await api().delete(`/proyectos/catalogos/tipos-plano/${p1}`).expect(409);
    });
  });

  // ─── Fin real, entrega y liquidación ─────────────────────────────────────────
  describe('liquidación', () => {
    it('la obra con presupuesto aprobado inicia y avanza hasta la mitad', async () => {
      await db.query(`insert into "ppto_Principal" ("IdPresupuesto", "Version", "TipoPpto", "Estado", estado_ppto, id_centro_costo) values ('E2E-LIQ-PPTO', 'V1', 'Principal', 'Aprobado', 'APROBADO', $1)`, [cc]);
      await api().post(`${obra()}/estado`).send({ estado: 'EN_EJECUCION' }).expect(201);
      const partida = (await api().post(`${obra()}/partidas`).send({ item: '01', nombre: 'Obras' }).expect(201)).body.id;
      idSub = (await api().post(`${obra()}/partidas/${partida}/subpartidas`).send({ item: '01.01', nombre: 'Tabiquería', fecha_inicio: inicio, fecha_fin: deDia(w1 + 12) }).expect(201)).body.id;
      await api().put(`${obra()}/avance/semanas/1`).send({ lineas: [{ idSubpartida: idSub, avance: 50 }] }).expect(200);
    });

    it('antes del 100 % no se registra la fecha de fin real ni se pasa a liquidación', async () => {
      const res = await api().patch(`/centros-costos/${cc}`).send({ FechaFinReal: hoy }).expect(409);
      expect(res.body.message).toMatch(/50 % de avance/);
      await api().patch(`/centros-costos/${cc}`).send({ Estado: 'POR LIQUIDAR' }).expect(409);
      expect((await ccFila()).fin_real).toBeNull();
    });

    it('al completar la ejecución, entregar la obra pasa sus presupuestos aprobados a ENTREGADO', async () => {
      await api().put(`${obra()}/avance/semanas/2`).send({ lineas: [{ idSubpartida: idSub, avance: 50 }] }).expect(200);
      await api().post(`${obra()}/estado`).send({ estado: 'POST_VENTA' }).expect(201);
      expect(await pptoEstado('E2E-LIQ-PPTO')).toEqual({ estado_ppto: 'ENTREGADO', legado: 'Entregado' });
      const fila = await ccFila();
      expect(fila.fin_real).toBe(hoy);
      expect(fila.presupuesto_estado).toBe('Entregado');
    });

    it('el centro de costo de una obra no se cierra a mano: se liquida', async () => {
      const res = await api().patch(`/centros-costos/${cc}`).send({ Estado: 'CERRADO' }).expect(409);
      expect(res.body.message).toMatch(/Liquidar/);
      await api().patch(`/centros-costos/${cc}`).send({ Estado: 'POR LIQUIDAR' }).expect(200);
      expect((await ccFila()).estado).toBe('POR LIQUIDAR');
    });

    it('con planos obligatorios pendientes no se liquida ni se entrega el dosier', async () => {
      const l = (await api().get(`${obra()}/liquidacion`).expect(200)).body;
      expect(l).toMatchObject({ liquidada: false, puede_liquidar: false, estado_cc: 'POR LIQUIDAR', fecha_fin_real: hoy, avance_real: 100 });
      expect(l.requisitos.map((r: { codigo: string; cumplido: boolean }) => [r.codigo, r.cumplido])).toEqual([['ESTADO', true], ['AVANCE', true], ['FIN_REAL', true], ['PLANOS', false]]);
      expect(l.planos.faltantes.map((f: { codigo: string }) => f.codigo)).toEqual(['E2E-LIQ-P2']);

      const liq = await api().post(`${obra()}/liquidacion`).expect(409);
      expect(liq.body.message).toMatch(/Faltan 1 plano\(s\) obligatorio\(s\)/);
      expect(liq.body.requisitos).toHaveLength(4);
      const dos = await api().get(`${obra()}/dosier`).expect(409);
      expect(dos.body.message).toMatch(/dosier.*faltan 1 plano/);
      expect((await ccFila()).estado).toBe('POR LIQUIDAR');
    });

    it('con todos los planos obligatorios se entrega el dosier', async () => {
      await api().put(`${obra()}/planos-requeridos/${p2}`).send({ entregado: true }).expect(200);
      const d = (await api().get(`${obra()}/dosier`).expect(200)).body;
      expect(d).toMatchObject({ id_centro_costo: cc, nombre_obra: 'E2E-LIQ-OBRA', fecha: hoy });
      expect(d.secciones.map((s: { codigo: string }) => s.codigo)).toEqual(['PRESUPUESTO_META', 'PRESUPUESTO_COMERCIAL', 'FICHA_OBRA', 'INFORME_AVANCE', 'PLANOS', 'DOCUMENTOS']);
      const seccion = (c: string) => d.secciones.find((s: { codigo: string }) => s.codigo === c);
      expect(seccion('PRESUPUESTO_META')).toMatchObject({ disponible: true, referencias: ['E2E-LIQ-PPTO'] });
      expect(seccion('INFORME_AVANCE')).toMatchObject({ disponible: true, referencias: ['01'] });
      expect(seccion('PLANOS').referencias[0]).toBe('2/2 obligatorios');
      expect(d.planos.completo).toBe(true);
    });

    it('liquida: el centro de costo se cierra y sus presupuestos pasan a LIQUIDADO, una sola vez', async () => {
      const res = await api().post(`${obra()}/liquidacion`).expect(200);
      expect(res.body).toMatchObject({ liquidada: true, puede_liquidar: false, estado_cc: 'CERRADO', fecha_liquidacion: hoy, liquidado_por: 'e2e-admin' });
      const fila = await ccFila();
      expect(fila).toMatchObject({ estado: 'CERRADO', liq: hoy, liquidado_por: 'e2e-admin', presupuesto_estado: 'Liquidado' });
      expect(await pptoEstado('E2E-LIQ-PPTO')).toEqual({ estado_ppto: 'LIQUIDADO', legado: 'Liquidado' });
      const evento = (await db.query(`select titulo from obra_evento where id_centro_costo = $1 and titulo = 'Obra liquidada'`, [cc])).rows;
      expect(evento).toHaveLength(1);

      const otra = await api().post(`${obra()}/liquidacion`).expect(409);
      expect(otra.body.message).toMatch(/ya está liquidada/);
    });
  });
});
