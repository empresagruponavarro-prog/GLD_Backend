import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import 'dotenv/config';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { aDia, deDia, lunesDe } from '../src/features/operaciones-obra/shared/control-avance/calendario.js';
import { hoyLima } from '../src/features/operaciones-obra/shared/obra-shared.js';
import { apiConSesion, borrarUsuarioE2E, crearUsuarioE2E } from './helpers/sesion.js';
import { AppModule } from './../src/app.module.js';

/**
 * Portafolio del Dashboard de Operaciones (fase 4) contra la BD de DATABASE_URL, con la API en modo
 * ESTRICTO. Crea cinco obras en situaciones distintas (`E2E-OPS2-*`), dos roles y dos usuarios, y los
 * elimina al final. Todas las aserciones filtran por `q=E2E-OPS2` porque la BD puede tener otras obras.
 *
 * Fechas relativas a hoy (Lima): las obras empezaron hace dos semanas (hoy cae en la semana 3 y la
 * semana 2 es la última cerrada).
 *
 * La prueba de volumen (1 000 obras × 40 subpartidas) es opt-in: `PERF_OPS=1 npm run test:e2e`.
 */
describe('Portafolio de operaciones (e2e)', () => {
  let app: INestApplication<App>;
  let db: pg.Client;
  let jwt: JwtService;
  const modoAnterior = process.env['PERMISOS_MODO'];

  const hoy = hoyLima();
  const w1 = lunesDe(aDia(hoy)) - 14;
  const inicio = deDia(w1);
  const api = () => apiConSesion(app);
  const lista = '/operaciones/portafolio?q=E2E-OPS2';

  let cliente1 = 0;
  let cliente2 = 0;
  let jefe1 = 0;
  let jefe2 = 0;
  let rolSinId = 0;
  let rolConId = 0;
  const id: Record<'A' | 'B' | 'C' | 'D' | 'E' | 'F', number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };

  const como = (usuarioId: string, rol: string) => {
    const auth = `Bearer ${jwt.sign({ sub: usuarioId, usuario: usuarioId.toLowerCase(), rol })}`;
    const server = app.getHttpServer();
    return {
      get: (u: string) => request(server).get(u).set('Authorization', auth),
      post: (u: string) => request(server).post(u).set('Authorization', auth),
      put: (u: string) => request(server).put(u).set('Authorization', auth),
    };
  };

  /** Crea un centro de costo y lo lleva por la API hasta el estado pedido. */
  async function crearObra(o: {
    clave: string;
    cliente: number;
    jefe: number;
    inicio: string;
    fin: string;
    subFin?: string;
    estado: 'EN_EJECUCION' | 'PROXIMO';
    avance?: number[];
    entregar?: boolean;
  }): Promise<number> {
    const cc = (
      await db.query(
        `insert into "CentroCostos" (centro_costo, estado, fecha_inicio, fecha_fin_prog, periodo, id_anexo) values ($1, 'ABIERTO', $2, $3, 2026, $4) returning id`,
        [`E2E-OPS2-${o.clave}`, o.inicio, o.fin, o.cliente],
      )
    ).rows[0].id as number;
    const base = `/operaciones/obra/${cc}`;
    await api().patch(`${base}/generales`).send({ codigo_obra: `E2E-OPS2-${o.clave}`, tienda: `Tienda ${o.clave}`, departamento: 'Lima', id_jefe_proyecto: o.jefe }).expect(200);
    if (o.subFin) {
      const p = await api().post(`${base}/partidas`).send({ item: '01', nombre: 'Obras civiles' }).expect(201);
      await api().post(`${base}/partidas/${p.body.id}/subpartidas`).send({ item: '01.01', nombre: 'Tabiquería', fecha_inicio: o.inicio, fecha_fin: o.subFin }).expect(201);
    }
    await api().post(`${base}/estado`).send({ estado: o.estado }).expect(201);
    if (o.avance?.length) {
      const grilla = (await api().get(`${base}/avance`).expect(200)).body;
      const sub = grilla.subpartidas[0].id;
      for (const [i, v] of o.avance.entries()) await api().put(`${base}/avance/semanas/${i + 1}`).send({ lineas: [{ idSubpartida: sub, avance: v }] }).expect(200);
    }
    if (o.entregar) await api().post(`${base}/estado`).send({ estado: 'POST_VENTA' }).expect(201);
    return cc;
  }

  const eventosDe = async (cc: number) => (await api().get(`/operaciones/obra/${cc}/eventos?limite=200`).expect(200)).body as {
    tipo: string; titulo: string; usuario: string | null; valor_antes: string | null; valor_despues: string | null; severidad: string;
  }[];
  const derivados = async (cc: number, tipo: string) => (await eventosDe(cc)).filter((e) => e.tipo === tipo && e.usuario === null);

  beforeAll(async () => {
    process.env['PERMISOS_MODO'] = 'estricto';
    db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
    await db.connect();
    await crearUsuarioE2E(db);

    const anexo = async (nombre: string, tipo: string) => (await db.query(`insert into anexos ("tipoAnexo", "Anexo", estado) values ($1, $2, true) returning id`, [tipo, nombre])).rows[0].id as number;
    cliente1 = await anexo('E2E-OPS2 Cliente Uno', 'Cliente');
    cliente2 = await anexo('E2E-OPS2 Cliente Dos', 'Cliente');
    jefe1 = await anexo('E2E-OPS2 Jefe Uno', 'Trabajador');
    jefe2 = await anexo('E2E-OPS2 Jefe Dos', 'Trabajador');

    // Dos roles: uno con solo `obra` y otro con `operaciones.ver`; y un usuario de cada uno.
    rolSinId = (await db.query(`insert into rol (nombre, descripcion, es_sistema) values ('E2E-OPS2-SIN', 'e2e', false) returning id`)).rows[0].id;
    rolConId = (await db.query(`insert into rol (nombre, descripcion, es_sistema) values ('E2E-OPS2-CON', 'e2e', false) returning id`)).rows[0].id;
    await db.query(`insert into rol_permiso (rol_id, modulo_id, ver, crear, editar, eliminar, aprobar, anular) select $1, m.id, true, true, true, true, false, false from modulo m where m.clave = 'obra'`, [rolSinId]);
    await db.query(`insert into rol_permiso (rol_id, modulo_id, ver, crear, editar, eliminar, aprobar, anular) select $1, m.id, true, false, false, false, false, false from modulo m where m.clave = 'operaciones'`, [rolConId]);
    await db.query(
      `insert into usuarios ("IdUsuario", "Nombres", "Usuario", "Clave", "Rol", activo, id_area) values
       ('E2E-OPS2-SIN', 'Sin operaciones', 'e2e-ops2-sin', null, 'E2E-OPS2-SIN', true, null),
       ('E2E-OPS2-CON', 'Con operaciones', 'e2e-ops2-con', null, 'E2E-OPS2-CON', true, null)`,
    );

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    jwt = moduleRef.get(JwtService);

    // A al día · B retrasada · C en post venta · E próxima · F con el plazo vencido · D sin fechas
    id.A = await crearObra({ clave: 'A', cliente: cliente1, jefe: jefe1, inicio, fin: deDia(w1 + 33), subFin: deDia(w1 + 27), estado: 'EN_EJECUCION', avance: [25, 25] });
    id.B = await crearObra({ clave: 'B', cliente: cliente1, jefe: jefe2, inicio, fin: deDia(w1 + 33), subFin: deDia(w1 + 27), estado: 'EN_EJECUCION', avance: [10] });
    id.C = await crearObra({ clave: 'C', cliente: cliente2, jefe: jefe2, inicio, fin: deDia(w1 + 33), subFin: deDia(w1 + 12), estado: 'EN_EJECUCION', avance: [50, 50], entregar: true });
    id.E = await crearObra({ clave: 'E', cliente: cliente1, jefe: jefe1, inicio: deDia(w1 + 28), fin: deDia(w1 + 60), subFin: deDia(w1 + 40), estado: 'PROXIMO' });
    id.F = await crearObra({ clave: 'F', cliente: cliente2, jefe: jefe1, inicio, fin: deDia(w1 + 10), estado: 'EN_EJECUCION' });
    id.D = (await db.query(`insert into "CentroCostos" (centro_costo, estado, id_anexo) values ('E2E-OPS2-D', 'ABIERTO', $1) returning id`, [cliente1])).rows[0].id;
    await db.query(`insert into obra_datos_generales (id_centro_costo, codigo_obra, tienda, estado_obra) values ($1, 'E2E-OPS2-D', 'Tienda D', 'EN_EJECUCION')`, [id.D]);
  });

  afterAll(async () => {
    if (modoAnterior === undefined) delete process.env['PERMISOS_MODO'];
    else process.env['PERMISOS_MODO'] = modoAnterior;
    if (db) {
      await db.query(`delete from "CentroCostos" where centro_costo like 'E2E-OPS2-%' or centro_costo like 'E2E-PERF-%'`); // obra_* y eventos, en cascada
      await db.query(`delete from usuarios where "IdUsuario" in ('E2E-OPS2-SIN', 'E2E-OPS2-CON')`);
      await db.query(`delete from rol where id in ($1, $2)`, [rolSinId, rolConId]); // sus permisos, en cascada
      await db.query(`delete from anexos where "Anexo" like 'E2E-OPS2 %'`);
      await borrarUsuarioE2E(db);
      await db.end();
    }
    await app?.close();
  });

  // ─── Permisos ─────────────────────────────────────────────────────────────────
  describe('permisos (módulo «operaciones»)', () => {
    it('tener acceso a una obra no da acceso al portafolio', async () => {
      await como('E2E-OPS2-SIN', 'E2E-OPS2-SIN').get('/operaciones/portafolio').expect(403);
      await como('E2E-OPS2-SIN', 'E2E-OPS2-SIN').get('/operaciones/portafolio/catalogos').expect(403);
      await como('E2E-OPS2-SIN', 'E2E-OPS2-SIN').get('/operaciones/portafolio/eventos').expect(403);
      await como('E2E-OPS2-SIN', 'E2E-OPS2-SIN').get(`/operaciones/portafolio/arboles?ids=${id.A}`).expect(403);
    });

    it('con «operaciones.ver» se puede leer, pero no sincronizar avisos (exige «crear»)', async () => {
      const u = como('E2E-OPS2-CON', 'E2E-OPS2-CON');
      await u.get(lista).expect(200);
      await u.get('/operaciones/portafolio/catalogos').expect(200);
      await u.post('/operaciones/portafolio/eventos/sincronizar').expect(403);
    });

    it('con ese rol tampoco se escribe sobre una obra', async () => {
      await como('E2E-OPS2-CON', 'E2E-OPS2-CON').get(`/operaciones/obra/${id.A}/control`).expect(403);
    });

    it('sin sesión, 401', async () => {
      await request(app.getHttpServer()).get('/operaciones/portafolio').expect(401);
    });
  });

  // ─── Listado ──────────────────────────────────────────────────────────────────
  describe('portafolio', () => {
    it('lista las cinco obras evaluables y deja aparte la que no tiene fechas', async () => {
      const r = (await api().get(lista).expect(200)).body;
      expect(r.hoy).toBe(hoy);
      expect(r.obras.map((o: { id_centro_costo: number }) => o.id_centro_costo)).toEqual([id.A, id.B, id.F, id.E, id.C]);
      expect(r.total).toBeGreaterThanOrEqual(5);
      const d = r.sin_evaluar.find((x: { id_centro_costo: number }) => x.id_centro_costo === id.D);
      expect(d).toMatchObject({ codigo_obra: 'E2E-OPS2-D', faltantes: ['fecha_inicio', 'fecha_fin_prog'] });
    });

    it('obra al día: ficha, cliente, equipo y mini Curva S', async () => {
      const a = (await api().get(lista).expect(200)).body.obras.find((o: { id_centro_costo: number }) => o.id_centro_costo === id.A);
      expect(a).toMatchObject({
        codigo_obra: 'E2E-OPS2-A',
        nombre: 'E2E-OPS2 Cliente Uno Tienda A',
        cliente: { id: cliente1, nombre: 'E2E-OPS2 Cliente Uno' },
        tienda: 'Tienda A',
        departamento: 'Lima',
        estado_obra: 'EN_EJECUCION',
        inicio,
      });
      expect(a.equipo.jefe_proyecto).toEqual({ id: jefe1, nombre: 'E2E-OPS2 Jefe Uno' });
      expect(a.equipo.coordinador).toBeNull();
      expect(a.resultado).toMatchObject({ estadoEfectivo: 'EN_EJECUCION', real: 50, situacion: { texto: 'Al día · Sem 3 en curso' }, sinAvance: false });
      expect(a.resultado.programado).toBeCloseTo(50, 6);
      expect(typeof a.resultado.avisos).toBe('number');
      expect(a.resultado).not.toHaveProperty('partidas');
      expect(a.curva.length).toBeGreaterThanOrEqual(4);
      expect(a.curva[1]).toMatchObject({ semana: 2, real: 50 });
    });

    it('obra retrasada: situación, desviación y días de retraso', async () => {
      const b = (await api().get(lista).expect(200)).body.obras.find((o: { id_centro_costo: number }) => o.id_centro_costo === id.B);
      expect(b.resultado.situacion.texto).toBe('Retrasada');
      expect(b.resultado.real).toBe(10);
      expect(b.resultado.desviacion).toBeCloseTo(-40, 6);
      expect(b.resultado.plazos.diasRetraso).toBeGreaterThan(0);
    });

    it('obra con el plazo vencido', async () => {
      const f = (await api().get(lista).expect(200)).body.obras.find((o: { id_centro_costo: number }) => o.id_centro_costo === id.F);
      expect(f.resultado.plazos.diasFueraDePlazo).toBe(aDia(hoy) - (w1 + 10));
      expect(f.resultado.sinPartidas).toBe(true);
      expect(f.curva).toBeNull();
    });

    it('obra próxima y obra entregada', async () => {
      const obras = (await api().get(lista).expect(200)).body.obras as { id_centro_costo: number; resultado: { estadoEfectivo: string; situacion: { texto: string }; postVenta: { texto: string } | null; semana: { texto: string } } }[];
      const e = obras.find((o) => o.id_centro_costo === id.E)!;
      expect(e.resultado).toMatchObject({ estadoEfectivo: 'PROXIMO', situacion: { texto: 'Por iniciar' } });
      expect(e.resultado.semana.texto).toMatch(/^Inicia \d\d\/\d\d$/);
      const c = obras.find((o) => o.id_centro_costo === id.C)!;
      expect(c.resultado).toMatchObject({ estadoEfectivo: 'POST_VENTA', situacion: { texto: 'Entregada' } });
      expect(c.resultado.postVenta).toMatchObject({ texto: 'En curso' });
    });
  });

  // ─── Filtros ──────────────────────────────────────────────────────────────────
  describe('filtros globales (RC-21)', () => {
    const ids = async (qs: string) => ((await api().get(`${lista}${qs}`).expect(200)).body.obras as { id_centro_costo: number }[]).map((o) => o.id_centro_costo);

    it('por estado efectivo', async () => {
      expect(await ids('&estado=PROXIMO')).toEqual([id.E]);
      expect(await ids('&estado=POST_VENTA')).toEqual([id.C]);
      expect(await ids('&estado=EN_EJECUCION')).toEqual([id.A, id.B, id.F]);
    });

    it('por cliente, jefe y departamento', async () => {
      expect(await ids(`&cliente=${cliente2}`)).toEqual([id.F, id.C]);
      expect(await ids(`&jefe=${jefe2}`)).toEqual([id.B, id.C]);
      expect(await ids('&departamento=lima')).toHaveLength(5);
      expect(await ids('&departamento=cusco')).toEqual([]);
    });

    it('por año de inicio, con y sin las vigentes de años anteriores', async () => {
      const anio = Number(inicio.slice(0, 4));
      const delAnio = await ids(`&anio=${anio}&vigentesAnteriores=false`);
      for (const k of ['A', 'B', 'C', 'F'] as const) expect(delAnio).toContain(id[k]);
      expect(await ids('&anio=2000')).toEqual([]);
      expect(await ids(`&anio=${anio + 1}`)).toEqual(expect.arrayContaining([id.A, id.B, id.C, id.F])); // vigentes de años anteriores
      expect(await ids(`&anio=${anio + 1}&vigentesAnteriores=false`)).not.toContain(id.A);
    });

    it('solo vigentes', async () => {
      expect(await ids('&soloVigentes=true')).toHaveLength(5);
    });

    it('búsqueda por código o nombre, sin tildes ni mayúsculas', async () => {
      const buscar = async (q: string) => ((await api().get(`/operaciones/portafolio?q=${encodeURIComponent(q)}`).expect(200)).body.obras as { id_centro_costo: number }[]).map((o) => o.id_centro_costo);
      expect(await buscar('e2e-ops2-b')).toEqual([id.B]);
      expect(await buscar('E2E-OPS2 CLIENTE UNO TIENDA E')).toEqual([id.E]);
      expect(await buscar('  e2e-ops2   cliente   uno  tienda a ')).toEqual([id.A]);
    });

    it('los filtros se combinan', async () => {
      expect(await ids(`&cliente=${cliente1}&estado=EN_EJECUCION`)).toEqual([id.A, id.B]);
    });

    it('valores inválidos, 400', async () => {
      for (const qs of ['estado=ZZZ', 'anio=abc', 'cliente=abc', 'hoy=ayer', 'hoy=2026-13-45', 'vigentesAnteriores=quizas', 'anio=1']) {
        await api().get(`/operaciones/portafolio?${qs}`).expect(400);
      }
    });

    it('?hoy= recalcula como estaba otro día y no escribe nada', async () => {
      const antes = (await eventosDe(id.A)).length;
      const r = (await api().get(`${lista}&hoy=${deDia(w1 + 3)}`).expect(200)).body;
      expect(r.hoy).toBe(deDia(w1 + 3));
      const a = r.obras.find((o: { id_centro_costo: number }) => o.id_centro_costo === id.A);
      expect(a.resultado.semana.actual).toBe(1);
      expect((await eventosDe(id.A)).length).toBe(antes);
    });
  });

  // ─── Catálogos y árboles ──────────────────────────────────────────────────────
  describe('catálogos y árboles', () => {
    it('los catálogos traen los clientes, jefes, departamentos y años con obras', async () => {
      const c = (await api().get('/operaciones/portafolio/catalogos').expect(200)).body;
      expect(c.clientes).toEqual(expect.arrayContaining([{ id: cliente1, nombre: 'E2E-OPS2 Cliente Uno' }, { id: cliente2, nombre: 'E2E-OPS2 Cliente Dos' }]));
      expect(c.jefes).toEqual(expect.arrayContaining([{ id: jefe1, nombre: 'E2E-OPS2 Jefe Uno' }, { id: jefe2, nombre: 'E2E-OPS2 Jefe Dos' }]));
      expect(c.departamentos).toContain('Lima');
      expect(c.anios).toContain(Number(inicio.slice(0, 4)));
    });

    it('árboles de varias obras en una sola llamada; las que no existen se omiten', async () => {
      const r = (await api().get(`/operaciones/portafolio/arboles?ids=${id.A},${id.B},999999999`).expect(200)).body;
      expect(r.map((x: { id_centro_costo: number }) => x.id_centro_costo)).toEqual([id.A, id.B].sort((x, y) => x - y));
      const a = r.find((x: { id_centro_costo: number }) => x.id_centro_costo === id.A);
      expect(a.partidas[0]).toMatchObject({ item: '01', real: 50 });
      expect(a.partidas[0].subpartidas[0]).toMatchObject({ item: '01.01', real: 50, situacion: { texto: 'Al día · Sem 3 en curso' } });
      expect(a.curvaS.semanas.length).toBeGreaterThanOrEqual(4);
      const b = r.find((x: { id_centro_costo: number }) => x.id_centro_costo === id.B);
      expect(b.partidas[0].subpartidas[0].situacion.texto).toBe('Retrasada');
    });

    it('valida los ids', async () => {
      await api().get('/operaciones/portafolio/arboles').expect(400);
      await api().get('/operaciones/portafolio/arboles?ids=').expect(400);
      await api().get('/operaciones/portafolio/arboles?ids=1,abc').expect(400);
      await api().get(`/operaciones/portafolio/arboles?ids=${Array.from({ length: 101 }, (_v, i) => i + 1).join(',')}`).expect(400);
    });
  });

  // ─── Avisos que dependen del tiempo (D17) ─────────────────────────────────────
  describe('avisos derivados del tiempo', () => {
    it('antes de evaluar, las obras no tienen avisos del sistema', async () => {
      // (la lectura del portafolio ya pudo dispararlos: se comprueba que, de existir, son los esperados)
      for (const e of await derivados(id.A, 'SITUACION')) expect(e.valor_despues).toBe('A tiempo');
    });

    it('la primera evaluación guarda la línea base de las obras en ejecución, y nada de las demás', async () => {
      const r = (await api().post('/operaciones/portafolio/eventos/sincronizar').expect(201)).body;
      expect(r.creados).toBeGreaterThanOrEqual(0);

      const a = await derivados(id.A, 'SITUACION');
      expect(a).toHaveLength(1);
      expect(a[0]).toMatchObject({ valor_antes: null, valor_despues: 'A tiempo', severidad: 'info' });
      const b = await derivados(id.B, 'SITUACION');
      expect(b).toHaveLength(1);
      expect(b[0]).toMatchObject({ valor_antes: null, valor_despues: 'Retrasada' });
      for (const k of ['C', 'E'] as const) expect(await derivados(id[k], 'SITUACION'), k).toEqual([]);
    });

    it('el plazo vencido genera un solo aviso crítico por cada fin vigente', async () => {
      const f = await derivados(id.F, 'VENCIDO');
      expect(f).toHaveLength(1);
      expect(f[0]).toMatchObject({ severidad: 'crit', valor_despues: deDia(w1 + 10) });
    });

    it('evaluar de nuevo no duplica nada', async () => {
      const antes = [(await eventosDe(id.A)).length, (await eventosDe(id.B)).length, (await eventosDe(id.F)).length];
      await api().post('/operaciones/portafolio/eventos/sincronizar').expect(201);
      await api().post('/operaciones/portafolio/eventos/sincronizar').expect(201);
      expect([(await eventosDe(id.A)).length, (await eventosDe(id.B)).length, (await eventosDe(id.F)).length]).toEqual(antes);
    });

    it('cuando la obra se recupera, el cambio de situación genera un aviso positivo con antes y después', async () => {
      const grilla = (await api().get(`/operaciones/obra/${id.B}/avance`).expect(200)).body;
      await api().put(`/operaciones/obra/${id.B}/avance/semanas/2`).send({ lineas: [{ idSubpartida: grilla.subpartidas[0].id, avance: 40 }] }).expect(200);
      await api().post('/operaciones/portafolio/eventos/sincronizar').expect(201);
      const b = await derivados(id.B, 'SITUACION');
      expect(b).toHaveLength(2);
      expect(b[0]).toMatchObject({ valor_antes: 'Retrasada', valor_despues: 'A tiempo', severidad: 'good' });
      expect(b[0].titulo).toMatch(/pasó a A tiempo/);
    });

    it('el feed del portafolio trae esos avisos con el código de la obra', async () => {
      const feed = (await api().get('/operaciones/portafolio/eventos?tipos=SITUACION,VENCIDO&limite=200').expect(200)).body as { codigo_obra: string | null; tipo: string; usuario: string | null; id: number }[];
      const mios = feed.filter((e) => e.codigo_obra?.startsWith('E2E-OPS2-'));
      expect(mios.length).toBeGreaterThanOrEqual(4); // base de A y B, recuperación de B y vencimiento de F
      expect(mios.every((e) => ['SITUACION', 'VENCIDO'].includes(e.tipo) && e.usuario === null)).toBe(true);
      const ids = feed.map((e) => e.id);
      expect(ids).toEqual([...ids].sort((x, y) => y - x));
    });

    it('el feed admite todos los tipos, límite y fecha, y valida los parámetros', async () => {
      const todos = (await api().get('/operaciones/portafolio/eventos?limite=3').expect(200)).body;
      expect(todos).toHaveLength(3);
      const manana = deDia(aDia(hoy) + 1);
      const ninguno = (await api().get(`/operaciones/portafolio/eventos?desde=${manana}`).expect(200)).body;
      expect(ninguno).toEqual([]);
      const desdeAyer = (await api().get(`/operaciones/portafolio/eventos?desde=${deDia(aDia(hoy) - 1)}&limite=200`).expect(200)).body;
      expect(desdeAyer.length).toBeGreaterThan(0);
      await api().get('/operaciones/portafolio/eventos?tipos=ZZZ').expect(400);
      await api().get('/operaciones/portafolio/eventos?limite=0').expect(400);
      await api().get('/operaciones/portafolio/eventos?limite=500').expect(400);
      await api().get('/operaciones/portafolio/eventos?desde=ayer').expect(400);
    });
  });

  // ─── Avisos de cada persona (RF-OP-49) ───────────────────────────────────────
  describe('campana: leídos y preferencias', () => {
    const u = () => como('E2E-OPS2-CON', 'E2E-OPS2-CON');

    it('quien no tiene «operaciones» no accede a la campana', async () => {
      await como('E2E-OPS2-SIN', 'E2E-OPS2-SIN').get('/operaciones/avisos').expect(403);
      await como('E2E-OPS2-SIN', 'E2E-OPS2-SIN').post('/operaciones/avisos/leidos').expect(403);
    });

    it('al empezar cuenta los avisos recientes y no hay preferencias', async () => {
      await api().post('/operaciones/portafolio/eventos/sincronizar').expect(201); // asegura que haya avisos
      const r = await u().get('/operaciones/avisos').expect(200);
      expect(r.body.visto_hasta).toBeNull();
      expect(r.body.tipos_importantes).toBeNull();
      expect(r.body.no_leidos).toBeGreaterThan(0);
    });

    it('con solo «ver» puede elegir tipos y marcar como leído (es personal, no exige crear ni editar)', async () => {
      const prefs = await u().put('/operaciones/avisos/preferencias').send({ tipos_importantes: ['VENCIDO'] }).expect(200);
      expect(prefs.body.tipos_importantes).toEqual(['VENCIDO']);

      const leido = await u().post('/operaciones/avisos/leidos').expect(200);
      expect(leido.body.visto_hasta).not.toBeNull();
      expect(leido.body.no_leidos).toBe(0);
      expect((await u().get('/operaciones/avisos').expect(200)).body.tipos_importantes).toEqual(['VENCIDO']);
    });

    it('lo leído y las preferencias son de cada persona', async () => {
      const otro = await api().get('/operaciones/avisos').expect(200);
      expect(otro.body.visto_hasta).toBeNull();
      expect(otro.body.tipos_importantes).toBeNull();
    });

    it('vaciar la lista vuelve a «todos» y valida los tipos', async () => {
      expect((await u().put('/operaciones/avisos/preferencias').send({ tipos_importantes: [] }).expect(200)).body.tipos_importantes).toBeNull();
      await u().put('/operaciones/avisos/preferencias').send({ tipos_importantes: ['INVENTADO'] }).expect(400);
      await u().put('/operaciones/avisos/preferencias').send({ tipos_importantes: ['ALTA', 'ALTA'] }).expect(400);
    });
  });

  // ─── Volumen (opt-in) ─────────────────────────────────────────────────────────
  describe.skipIf(!process.env['PERF_OPS'])('volumen: 1 000 obras × 40 subpartidas', () => {
    it('el portafolio responde en menos de 2 segundos', async () => {
      const n = 1000;
      await db.query(
        `insert into "CentroCostos" (centro_costo, estado, fecha_inicio, fecha_fin_prog, periodo, id_anexo)
         select 'E2E-PERF-' || g, 'ABIERTO', $1::date, $2::date, 2026, $3 from generate_series(1, $4::int) g`,
        [inicio, deDia(w1 + 33), cliente1, n],
      );
      await db.query(
        `insert into obra_datos_generales (id_centro_costo, codigo_obra, tienda, departamento, estado_obra, id_jefe_proyecto)
         select id, centro_costo, 'Perf', 'Lima', 'EN_EJECUCION', $1 from "CentroCostos" where centro_costo like 'E2E-PERF-%'`,
        [jefe1],
      );
      await db.query(
        `insert into obra_partida (id_centro_costo, item, nombre, orden)
         select c.id, lpad(p::text, 2, '0'), 'Partida ' || p, p from "CentroCostos" c, generate_series(1, 4) p where c.centro_costo like 'E2E-PERF-%'`,
      );
      await db.query(
        `insert into obra_subpartida (id_partida, id_centro_costo, item, nombre, fecha_inicio, fecha_fin, orden)
         select pa.id, pa.id_centro_costo, pa.item || '.' || lpad(s::text, 2, '0'), 'Sub ' || s, $1::date, $1::date + 27, s
         from obra_partida pa join "CentroCostos" c on c.id = pa.id_centro_costo, generate_series(1, 10) s where c.centro_costo like 'E2E-PERF-%'`,
        [inicio],
      );
      await db.query(
        `insert into obra_subpartida_semana (id_subpartida, numero_semana, avance)
         select s.id, w, 20 from obra_subpartida s join "CentroCostos" c on c.id = s.id_centro_costo, generate_series(1, 2) w where c.centro_costo like 'E2E-PERF-%'`,
      );

      const medir = async (url: string) => {
        const t0 = performance.now();
        const res = await api().get(url).expect(200);
        return { ms: performance.now() - t0, res };
      };
      const frio = await medir('/operaciones/portafolio?q=E2E-PERF');
      const tibio = await medir('/operaciones/portafolio?q=E2E-PERF');
      const arboles = await medir(`/operaciones/portafolio/arboles?ids=${(await db.query(`select id from "CentroCostos" where centro_costo like 'E2E-PERF-%' order by id limit 100`)).rows.map((r) => r.id).join(',')}`);
      // eslint-disable-next-line no-console
      console.log(`[PERF_OPS] portafolio 1000 obras × 40 subpartidas: ${frio.ms.toFixed(0)} ms (1.ª), ${tibio.ms.toFixed(0)} ms (2.ª) · árboles de 100 obras: ${arboles.ms.toFixed(0)} ms · ${(Buffer.byteLength(JSON.stringify(frio.res.body)) / 1024).toFixed(0)} KB`);
      expect(frio.res.body.obras).toHaveLength(n);
      expect(frio.ms).toBeLessThan(2000);
      expect(tibio.ms).toBeLessThan(2000);
    }, 120_000);
  });
});
