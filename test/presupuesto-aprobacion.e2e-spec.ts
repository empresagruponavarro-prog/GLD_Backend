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
 * Aprobación del presupuesto y captura de la estructura de la obra (GRP, fase F2) contra la BD de DATABASE_URL.
 * Crea sus propios centros de costo (`E2E-GRP-*`), catálogo, presupuestos y un rol de prueba, y los elimina al final.
 *
 * Recorrido: alta → validación → limpiar vacíos → aprobar (captura) → segundo Principal (409) → adicional →
 * sin fechas → nueva versión (reemplaza solo lo contractual) → avance (bloquea) → permisos.
 */
describe('Aprobación del presupuesto (e2e)', () => {
  let app: INestApplication<App>;
  let db: pg.Client;
  let jwt: JwtService;
  const modoAnterior = process.env['PERMISOS_MODO'];

  const hoy = hoyLima();
  const w1 = lunesDe(aDia(hoy)) - 14;
  const inicio = deDia(w1);
  const fin = deDia(w1 + 33);

  let ccA = 0;
  let ccB = 0;
  let ccSin = 0;
  let producto = 0;
  let unidad = 0;
  let rolId = 0;
  let idP1 = 0;
  let codigoV2 = '';
  let codigoV3 = '';
  let idV2 = 0;
  const api = () => apiConSesion(app);
  /** Usuario con ver, crear y editar en presupuestos pero SIN aprobar. */
  const sinAprobar = () => {
    const auth = `Bearer ${jwt.sign({ sub: 'E2E-GRP', usuario: 'e2e-grp', rol: 'E2E-GRP-ROL' })}`;
    const server = app.getHttpServer();
    return {
      get: (url: string) => request(server).get(url).set('Authorization', auth),
      post: (url: string) => request(server).post(url).set('Authorization', auth),
    };
  };

  const redondear2 = (n: number) => Math.round(n * 100) / 100;
  interface CatSpec {
    cat: string;
    items: [number, number][]; // [cantidad, costo unitario]
  }
  interface FaseSpec {
    fase: string;
    costo?: number; // monto escrito a mano (solo para fases sin categorías)
    cats: CatSpec[];
  }
  /** Arma fases, categorías e ítems de un presupuesto ya creado, con los costos como los deja la pantalla. */
  const armar = async (codigo: string, idCc: number, fases: FaseSpec[]) => {
    for (const [i, f] of fases.entries()) {
      const idDetalle = `E2E-GRP-DF-${codigo}-${i}`;
      const costoCats = f.cats.map((c) => redondear2(c.items.reduce((a, [q, p]) => a + redondear2(q * p), 0)));
      const costoFase = f.cats.length > 0 ? redondear2(costoCats.reduce((a, b) => a + b, 0)) : (f.costo ?? 0);
      await db.query(
        `insert into "ppto_DetalleFases" ("IdPresupuestoDetalle", "IdPresupuesto", id_centro_costo, "IdpptoFase", "CostoDirecto") values ($1, $2, $3, $4, $5)`,
        [idDetalle, codigo, idCc, f.fase, costoFase],
      );
      for (const [j, c] of f.cats.entries()) {
        const cat = (
          await db.query(
            `insert into "ppto_DetalleFasesCate" ("IdPresupuestoDetalleCategoria", "IdPresupuesto", "IdPresupuestoDetalle", id_centro_costo, "IdpptoFase", "IdpptoFaseCategoria", "CostoDirecto")
             values ($1, $2, $3, $4, $5, $6, $7) returning id`,
            [`E2E-GRP-DC-${codigo}-${i}-${j}`, codigo, idDetalle, idCc, f.fase, c.cat, costoCats[j]],
          )
        ).rows[0].id as number;
        for (const [k, [q, p]] of c.items.entries()) {
          await db.query(
            `insert into "ppto_DetalleItems" (id_detalle_categoria, "IdPresupuesto", id_producto, id_unidad_medida, "Cantidad", "CostoUnitario", "CostoTotal", "Orden")
             values ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [cat, codigo, producto, unidad, q, p, redondear2(q * p), k],
          );
        }
      }
    }
  };

  const crearPpto = async (codigo: string, idCc: number, tipo: 'Principal' | 'Adicional', extra: Record<string, unknown> = {}) => {
    const { body } = await api()
      .post('/presupuestos')
      .send({ IdPresupuesto: codigo, id_centro_costo: idCc, TipoPpto: tipo, Proyecto: 'E2E GRP', Estado: 'PENDIENTE', ...extra })
      .expect(201);
    return body as { id: number; estado_ppto: string };
  };
  const estadoDe = async (codigo: string) =>
    (await db.query(`select estado_ppto, "Estado" legado from "ppto_Principal" where "IdPresupuesto" = $1`, [codigo])).rows[0] as { estado_ppto: string; legado: string };
  const partidas = async (idCc: number) =>
    (await db.query(`select id, item, tipo::text tipo, id_ppto_detalle_fase from obra_partida where id_centro_costo = $1 order by orden, id`, [idCc])).rows as {
      id: number;
      item: string;
      tipo: string;
      id_ppto_detalle_fase: number;
    }[];
  const subpartidas = async (idCc: number) =>
    (await db.query(`select id, item, tipo::text tipo, monto::text monto, id_ppto_detalle_categoria from obra_subpartida where id_centro_costo = $1 order by id`, [idCc])).rows as {
      id: number;
      item: string;
      tipo: string | null;
      monto: string | null;
      id_ppto_detalle_categoria: number;
    }[];
  const ccResumen = async (idCc: number) =>
    (await db.query(`select presupuesto_estado, presupuesto_monto::text monto from "CentroCostos" where id = $1`, [idCc])).rows[0] as {
      presupuesto_estado: string;
      monto: string;
    };

  beforeAll(async () => {
    process.env['PERMISOS_MODO'] = 'estricto';
    db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
    await db.connect();
    await crearUsuarioE2E(db);

    producto = (await db.query(`select id from producto order by id limit 1`)).rows[0].id;
    unidad = (await db.query(`select id from unidad_medida order by id limit 1`)).rows[0].id;

    const cliente = (await db.query(`insert into anexos ("tipoAnexo", "Anexo", estado) values ('Cliente', 'E2E-GRP Cliente', true) returning id`)).rows[0].id as number;
    const crearCc = async (nombre: string, conFechas: boolean) =>
      (
        await db.query(
          `insert into "CentroCostos" (centro_costo, estado, fecha_inicio, fecha_fin_prog, periodo, id_anexo) values ($1, 'ABIERTO', $2, $3, 2026, $4) returning id`,
          [nombre, conFechas ? inicio : null, conFechas ? fin : null, cliente],
        )
      ).rows[0].id as number;
    ccA = await crearCc('E2E-GRP-A', true);
    ccB = await crearCc('E2E-GRP-B', true);
    ccSin = await crearCc('E2E-GRP-SIN-FECHAS', false);

    await db.query(`insert into "ppto_Fases" ("IdpptoFase", "FaseProyecto") values ('E2E-GRP-F1', 'E2E GRP FASE 1'), ('E2E-GRP-F2', 'E2E GRP FASE 2')`);
    await db.query(
      `insert into "ppto_FasesCategorias" ("IdpptoFaseCategoria", "IdpptoFase", "Descripcion")
       values ('E2E-GRP-C1', 'E2E-GRP-F1', 'E2E MATERIALES'), ('E2E-GRP-C2', 'E2E-GRP-F1', 'E2E EQUIPOS'), ('E2E-GRP-C3', 'E2E-GRP-F1', 'E2E MANO DE OBRA'), ('E2E-GRP-C4', 'E2E-GRP-F1', 'E2E ADICIONALES')`,
    );

    rolId = (await db.query(`insert into rol (nombre, descripcion, es_sistema) values ('E2E-GRP-ROL', 'rol de prueba e2e', false) returning id`)).rows[0].id;
    await db.query(
      `insert into rol_permiso (rol_id, modulo_id, ver, crear, editar, eliminar, aprobar, anular)
       select $1, m.id, true, true, true, false, false, false from modulo m where m.clave = 'presupuestos'`,
      [rolId],
    );
    await db.query(
      `insert into usuarios ("IdUsuario", "Nombres", "Usuario", "Clave", "Rol", activo, id_area) values ('E2E-GRP', 'Usuario e2e sin aprobar', 'e2e-grp', null, 'E2E-GRP-ROL', true, null)`,
    );

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    jwt = app.get(JwtService, { strict: false });
  });

  afterAll(async () => {
    process.env['PERMISOS_MODO'] = modoAnterior;
    if (db) {
      // Los presupuestos (incluidas las versiones, que llevan código PPTO-AAAA-NNN) se borran antes que el centro de costo,
      // porque `id_centro_costo` es SET NULL y quedarían huérfanos. Sus fases y categorías se borran en cascada.
      const ids = `(select id from "CentroCostos" where centro_costo like 'E2E-GRP-%')`;
      await db.query(`delete from "ppto_Principal_Historial" where "IdPresupuesto" in (select "IdPresupuesto" from "ppto_Principal" where id_centro_costo in ${ids})`);
      await db.query(`update "ppto_Principal" set id_version_de = null where id_centro_costo in ${ids}`);
      await db.query(`delete from "ppto_Principal" where id_centro_costo in ${ids}`);
      await db.query(`delete from "ppto_Fases" where "IdpptoFase" like 'E2E-GRP-%'`);
      await db.query(`delete from "CentroCostos" where centro_costo like 'E2E-GRP-%'`); // obra_* en cascada
      await db.query(`delete from anexos where "Anexo" like 'E2E-GRP %'`);
      await db.query(`delete from usuarios where "IdUsuario" = 'E2E-GRP'`);
      await db.query('delete from rol where id = $1', [rolId]);
      await borrarUsuarioE2E(db);
      await db.end();
    }
    await app?.close();
  });

  // ─── Estado ───────────────────────────────────────────────────────────────────
  describe('estado del presupuesto', () => {
    it('el alta no admite APROBADO y normaliza el estado', async () => {
      const res = await api()
        .post('/presupuestos')
        .send({ IdPresupuesto: 'E2E-GRP-P1', id_centro_costo: ccA, TipoPpto: 'Principal', Estado: 'APROBADO' })
        .expect(400);
      expect(JSON.stringify(res.body.message)).toMatch(/aprobar/);

      const creado = await crearPpto('E2E-GRP-P1', ccA, 'Principal');
      idP1 = creado.id;
      expect(creado.estado_ppto).toBe('EN_DESARROLLO');
      expect(await estadoDe('E2E-GRP-P1')).toEqual({ estado_ppto: 'EN_DESARROLLO', legado: 'PENDIENTE' });
    });

    it('PATCH acepta los estados de trabajo y rechaza aprobar por esa vía', async () => {
      await api().patch('/presupuestos/E2E-GRP-P1').send({ Estado: 'APROBADO' }).expect(400);
      await api().patch('/presupuestos/E2E-GRP-P1').send({ Estado: 'ENTREGADO' }).expect(400);
      const res = await api().patch('/presupuestos/E2E-GRP-P1').send({ Estado: 'En_Revision' }).expect(200);
      expect(res.body.estado_ppto).toBe('EN_REVISION');
      expect(await estadoDe('E2E-GRP-P1')).toEqual({ estado_ppto: 'EN_REVISION', legado: 'En_Revision' });
    });
  });

  // ─── Validación y limpieza ────────────────────────────────────────────────────
  describe('validación y limpiar vacíos', () => {
    it('un presupuesto incompleto no se puede aprobar y se explica por qué', async () => {
      await armar('E2E-GRP-P1', ccA, [
        { fase: 'E2E-GRP-F1', cats: [
          { cat: 'E2E-GRP-C1', items: [[10, 5], [2, 100]] }, // completa: 50 + 200
          { cat: 'E2E-GRP-C2', items: [] }, // sin ítems
          { cat: 'E2E-GRP-C3', items: [[0, 50]] }, // ítem vacío
        ] },
        { fase: 'E2E-GRP-F2', costo: 200, cats: [] }, // monto manual sin ítems (D-09)
      ]);
      const { body } = await api().get('/presupuestos/E2E-GRP-P1/validacion').expect(200);
      expect(body.puede_aprobar).toBe(false);
      expect(body.tipo).toBe('Principal');
      expect(body.bloqueos).toEqual([]);
      expect(body.problemas.map((p: { codigo: string }) => p.codigo).sort()).toEqual(['CATEGORIA_SIN_ITEMS', 'FASE_SIN_CATEGORIAS', 'ITEM_VACIO']);
      expect(body.resumen).toMatchObject({ fases: 2, categorias: 3, items: 3 });

      const res = await api().post('/presupuestos/E2E-GRP-P1/aprobar').expect(400);
      expect(res.body.message).toMatch(/no está completo \(3 pendiente/);
      expect(res.body.problemas).toHaveLength(3);
      expect((await estadoDe('E2E-GRP-P1')).estado_ppto).toBe('EN_REVISION'); // no cambió nada
      expect(await partidas(ccA)).toHaveLength(0);
    });

    it('limpiar vacíos borra ítems en cero y categorías sin ítems, recalcula y deja la fase manual a decisión del usuario', async () => {
      const { body } = await api().post('/presupuestos/E2E-GRP-P1/limpiar-vacios').expect(200);
      expect(body).toMatchObject({ items_eliminados: 1, categorias_eliminadas: 2, costo_directo: '450.00' }); // 250 + 200 manual
      expect(body.fases_sin_categorias).toEqual([expect.objectContaining({ nombre: 'E2E GRP FASE 2' })]);
      const cats = (await db.query(`select count(*)::int n from "ppto_DetalleFasesCate" where "IdPresupuesto" = 'E2E-GRP-P1'`)).rows[0].n;
      expect(cats).toBe(1);
      const cab = (await db.query(`select "CostoDirecto"::text cd from "ppto_Principal" where "IdPresupuesto" = 'E2E-GRP-P1'`)).rows[0].cd;
      expect(Number(cab)).toBe(450);

      const v = (await api().get('/presupuestos/E2E-GRP-P1/validacion').expect(200)).body;
      expect(v.problemas.map((p: { codigo: string }) => p.codigo)).toEqual(['FASE_SIN_CATEGORIAS']);
    });

    it('quitada la fase manual, el presupuesto queda listo para aprobar', async () => {
      await db.query(`delete from "ppto_DetalleFases" where "IdPresupuestoDetalle" = 'E2E-GRP-DF-E2E-GRP-P1-1'`);
      const v = (await api().get('/presupuestos/E2E-GRP-P1/validacion').expect(200)).body;
      expect(v).toMatchObject({ puede_aprobar: true, problemas: [], bloqueos: [] });
    });
  });

  // ─── Aprobar ──────────────────────────────────────────────────────────────────
  describe('aprobar el Principal', () => {
    it('quien no tiene el permiso «aprobar» no puede aprobar (403), pero sí ver la validación', async () => {
      await sinAprobar().get('/presupuestos/E2E-GRP-P1/validacion').expect(200);
      await sinAprobar().post('/presupuestos/E2E-GRP-P1/aprobar').expect(403);
      expect((await estadoDe('E2E-GRP-P1')).estado_ppto).toBe('EN_REVISION');
    });

    it('aprueba y captura la estructura de la obra, con su monto, en la misma operación', async () => {
      const { body } = await api().post('/presupuestos/E2E-GRP-P1/aprobar').expect(200);
      expect(body).toMatchObject({
        id: idP1,
        id_presupuesto: 'E2E-GRP-P1',
        estado_ppto: 'APROBADO',
        tipo: 'Principal',
        estructura: { capturada: true, partidas: 1, subpartidas: 1 },
      });
      expect(body.reemplaza).toBeUndefined();

      expect(await estadoDe('E2E-GRP-P1')).toEqual({ estado_ppto: 'APROBADO', legado: 'Aprobado' });
      const fila = (await db.query(`select aprobado_por, fecha_aprobacion from "ppto_Principal" where "IdPresupuesto" = 'E2E-GRP-P1'`)).rows[0];
      expect(fila.aprobado_por).toBe('e2e-admin');
      expect(fila.fecha_aprobacion).not.toBeNull();

      const ps = await partidas(ccA);
      expect(ps.map((p) => [p.item, p.tipo])).toEqual([['01', 'CONTRACTUAL']]);
      const ss = await subpartidas(ccA);
      expect(ss).toHaveLength(1);
      expect(ss[0]).toMatchObject({ item: '01.01', tipo: null });
      expect(Number(ss[0].monto)).toBe(250);

      expect(await ccResumen(ccA)).toEqual({ presupuesto_estado: 'Aprobado', monto: '250.00' });
      const evento = (await db.query(`select titulo from obra_evento where id_centro_costo = $1 and tipo = 'ALTA'`, [ccA])).rows;
      expect(evento.map((e: { titulo: string }) => e.titulo)).toEqual([expect.stringContaining('E2E-GRP-P1 aprobado')]);
    });

    it('aprobar de nuevo es un 409 y un estado aprobado ya no se cambia por PATCH', async () => {
      const res = await api().post('/presupuestos/E2E-GRP-P1/aprobar').expect(409);
      expect(res.body.bloqueos[0].codigo).toBe('YA_APROBADO');
      await api().patch('/presupuestos/E2E-GRP-P1').send({ Estado: 'Aprobado' }).expect(200); // reenvío del mismo estado
      await api().patch('/presupuestos/E2E-GRP-P1').send({ Estado: 'En_Revision' }).expect(409);
      expect((await estadoDe('E2E-GRP-P1')).estado_ppto).toBe('APROBADO');
    });

    it('un segundo Principal no se aprueba: se crea como adicional (DG15)', async () => {
      await crearPpto('E2E-GRP-P2', ccA, 'Principal');
      await armar('E2E-GRP-P2', ccA, [{ fase: 'E2E-GRP-F2', cats: [{ cat: 'E2E-GRP-C1', items: [[1, 10]] }] }]);
      const res = await api().post('/presupuestos/E2E-GRP-P2/aprobar').expect(409);
      expect(res.body.bloqueos[0]).toMatchObject({ codigo: 'OTRO_PRINCIPAL' });
      expect(res.body.message).toMatch(/E2E-GRP-P1.*adicional/);
      await api().delete('/presupuestos/E2E-GRP-P2').expect(200);
      expect(await partidas(ccA)).toHaveLength(1);
    });
  });

  // ─── Adicionales ──────────────────────────────────────────────────────────────
  describe('adicionales', () => {
    it('un adicional agrega sus partidas aparte, aunque la fase ya exista en el Principal (SP-14)', async () => {
      await crearPpto('E2E-GRP-A1', ccA, 'Adicional');
      await armar('E2E-GRP-A1', ccA, [{ fase: 'E2E-GRP-F1', cats: [{ cat: 'E2E-GRP-C4', items: [[4, 25]] }] }]);
      const { body } = await api().post('/presupuestos/E2E-GRP-A1/aprobar').expect(200);
      expect(body).toMatchObject({ tipo: 'Adicional', estado_ppto: 'APROBADO', estructura: { capturada: true, partidas: 1, subpartidas: 1 } });

      const ps = await partidas(ccA);
      expect(ps.map((p) => [p.item, p.tipo])).toEqual([['01', 'CONTRACTUAL'], ['02', 'ADICIONAL']]);
      const ss = await subpartidas(ccA);
      expect(ss.map((s) => [s.item, s.tipo, Number(s.monto)])).toEqual([['01.01', null, 250], ['02.01', 'ADICIONAL', 100]]);
      // El centro de costo suma el Principal y el adicional aprobados.
      expect(await ccResumen(ccA)).toEqual({ presupuesto_estado: 'Aprobado', monto: '350.00' });
    });

    it('un adicional sin Principal aprobado no se aprueba', async () => {
      await crearPpto('E2E-GRP-A2', ccB, 'Adicional');
      await armar('E2E-GRP-A2', ccB, [{ fase: 'E2E-GRP-F1', cats: [{ cat: 'E2E-GRP-C4', items: [[1, 10]] }] }]);
      const res = await api().post('/presupuestos/E2E-GRP-A2/aprobar').expect(409);
      expect(res.body.bloqueos[0].codigo).toBe('SIN_PRINCIPAL');
      expect(await partidas(ccB)).toHaveLength(0);
    });
  });

  // ─── Sin fechas ───────────────────────────────────────────────────────────────
  describe('centro de costo sin fechas', () => {
    it('aprueba igual, pero no captura la estructura y dice por qué', async () => {
      await crearPpto('E2E-GRP-P3', ccSin, 'Principal');
      await armar('E2E-GRP-P3', ccSin, [{ fase: 'E2E-GRP-F1', cats: [{ cat: 'E2E-GRP-C1', items: [[3, 10]] }] }]);
      const { body } = await api().post('/presupuestos/E2E-GRP-P3/aprobar').expect(200);
      expect(body.estado_ppto).toBe('APROBADO');
      expect(body.estructura).toMatchObject({ capturada: false, partidas: 0, subpartidas: 0 });
      expect(body.estructura.motivo).toMatch(/inicio y fin programado/);
      expect(await partidas(ccSin)).toHaveLength(0);
      expect((await ccResumen(ccSin)).presupuesto_estado).toBe('Aprobado');
    });
  });

  // ─── Nueva versión ────────────────────────────────────────────────────────────
  describe('nueva versión del Principal', () => {
    it('copia la estructura completa a un presupuesto nuevo en desarrollo', async () => {
      const { body } = await api().post('/presupuestos/E2E-GRP-P1/nueva-version').expect(201);
      codigoV2 = body.id_presupuesto;
      idV2 = body.id;
      expect(codigoV2).toMatch(/^PPTO-\d{4}-\d{3}$/);
      expect(body).toMatchObject({ numero_version: 2, id_version_de: idP1, fases: 1, categorias: 1, items: 2 });

      const fila = await estadoDe(codigoV2);
      expect(fila).toEqual({ estado_ppto: 'EN_DESARROLLO', legado: 'PENDIENTE' });
      const copia = (await db.query(`select numero_version, id_version_de, "Version" v from "ppto_Principal" where "IdPresupuesto" = $1`, [codigoV2])).rows[0];
      expect(copia).toMatchObject({ numero_version: 2, id_version_de: idP1, v: 'V2' });
      // Lo copiado es independiente del original.
      const items = (await db.query(`select count(*)::int n from "ppto_DetalleItems" where "IdPresupuesto" = $1`, [codigoV2])).rows[0].n;
      expect(items).toBe(2);
      expect((await estadoDe('E2E-GRP-P1')).estado_ppto).toBe('APROBADO'); // la anterior sigue vigente hasta aprobar la nueva
    });

    it('un adicional no tiene versiones', async () => {
      await api().post('/presupuestos/E2E-GRP-A1/nueva-version').expect(400);
    });

    it('al aprobar la versión, la anterior pasa a ANULADO y se reemplaza solo la estructura contractual', async () => {
      const { body } = await api().post(`/presupuestos/${codigoV2}/aprobar`).expect(200);
      expect(body).toMatchObject({ tipo: 'Principal', estructura: { capturada: true, partidas: 1, subpartidas: 1 } });
      expect(body.reemplaza).toEqual({ id: idP1, id_presupuesto: 'E2E-GRP-P1' });
      expect((await estadoDe('E2E-GRP-P1')).estado_ppto).toBe('ANULADO');

      const ps = await partidas(ccA);
      expect(ps.map((p) => p.tipo).sort()).toEqual(['ADICIONAL', 'CONTRACTUAL']);
      const adicional = ps.find((p) => p.tipo === 'ADICIONAL');
      expect(adicional?.item).toBe('02'); // el adicional se conserva intacto
      const nueva = ps.find((p) => p.tipo === 'CONTRACTUAL')!;
      expect(nueva.item).toBe('03'); // la numeración sigue a la del adicional
      const faseDeV2 = (await db.query(`select "IdPresupuesto" from "ppto_DetalleFases" where id = $1`, [nueva.id_ppto_detalle_fase])).rows[0].IdPresupuesto;
      expect(faseDeV2).toBe(codigoV2);

      // Aprobados: la versión nueva (250) y el adicional (100); el anulado no cuenta.
      expect(await ccResumen(ccA)).toEqual({ presupuesto_estado: 'Aprobado', monto: '350.00' });
    });

    it('con avance registrado no se admite una nueva versión (hay que crear un adicional)', async () => {
      // La versión 3 se crea antes del avance; su aprobación también queda bloqueada después.
      const v3 = (await api().post(`/presupuestos/${codigoV2}/nueva-version`).expect(201)).body;
      codigoV3 = v3.id_presupuesto;
      expect(v3.numero_version).toBe(3);

      const sub = (await subpartidas(ccA)).find((s) => s.tipo === null)!;
      await db.query(`insert into obra_subpartida_semana (id_subpartida, numero_semana, avance) values ($1, 1, 10)`, [sub.id]);

      const res = await api().post(`/presupuestos/${codigoV2}/nueva-version`).expect(409);
      expect(res.body.message).toMatch(/avance.*adicional/);
      const res2 = await api().post(`/presupuestos/${codigoV3}/aprobar`).expect(409);
      expect(res2.body.message).toMatch(/avance/);
      expect((await estadoDe(codigoV3)).estado_ppto).toBe('EN_DESARROLLO');
      expect((await estadoDe(codigoV2)).estado_ppto).toBe('APROBADO');
      expect(idV2).toBeGreaterThan(0);
    });
  });
});
