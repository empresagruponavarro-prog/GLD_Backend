import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import 'dotenv/config';
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { apiConSesion, borrarUsuarioE2E, crearUsuarioE2E } from './helpers/sesion.js';
import { AppModule } from './../src/app.module.js';

/**
 * Importación del Excel por proyecto (fase 8) contra la BD de DATABASE_URL, con la API en modo ESTRICTO.
 * Usa el Excel real de OP-26-017 (el del jefe), con la ficha cambiada a datos propios `E2E-IMP-*` para
 * no chocar con la BD, y lo compara con lo que calculó Excel (golden: 83 % real, 83 % programado al
 * 19/10/2026). Crea y elimina sus propios datos.
 */
describe('Importación del Excel por proyecto (e2e)', () => {
  let app: INestApplication<App>;
  let db: pg.Client;
  let jwt: JwtService;
  const modoAnterior = process.env['PERMISOS_MODO'];
  const api = () => apiConSesion(app);

  const FIXTURE = new URL('../src/features/operaciones-obra/importacion/__fixtures__/OP-26-017_Tambo_Pacasmayo_Callao.xlsx', import.meta.url);
  const GOLDEN = JSON.parse(readFileSync(new URL('../src/features/operaciones-obra/shared/control-avance/__fixtures__/op-26-017.json', import.meta.url), 'utf8')) as {
    hoySugerido: string;
    esperadoObra: { realPct: number; programadoPct: number; semanaEnCurso: number; finVigente: string };
  };

  let cliente = 0;
  let jefe = 0;
  let coord = 0;
  let cc = 0;
  let ccOtra = 0;
  let rolVerId = 0;

  /** El Excel real con la ficha cambiada (el resto: partidas, fechas y avance, intacto). */
  async function excel(cambios: Record<string, string | null> = {}): Promise<Buffer> {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.readFile(decodeURIComponent(FIXTURE.pathname.replace(/^\/([A-Za-z]:)/, '$1')));
    const ficha = libro.getWorksheet('Ficha')!;
    const valores: Record<string, string | null> = {
      'Código de obra': 'E2E-IMP-017',
      'Jefe de proyecto': 'E2E-IMP Jefe',
      Coordinador: 'E2E-IMP Coord',
      ...cambios,
    };
    ficha.eachRow((row) => {
      const etiqueta = String(row.getCell(2).value ?? '').replace(/\*/g, '').replace(/\(.*?\)/g, '').trim();
      if (etiqueta in valores) row.getCell(3).value = valores[etiqueta];
    });
    return Buffer.from(await libro.xlsx.writeBuffer());
  }

  const subir = (url: string, archivo: Buffer | null, nombre = 'proyecto.xlsx') => {
    const r = request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${jwt.sign({ sub: 'E2E-ADMIN', usuario: 'e2e-admin', rol: 'Administrador' })}`);
    return archivo ? r.attach('archivo', archivo, nombre) : r;
  };
  const base = () => `/operaciones/obra/${cc}`;
  const previa = (archivo: Buffer | null, nombre?: string) => subir(`${base()}/importar-excel`, archivo, nombre);
  const importar = (archivo: Buffer | null, nombre?: string) => subir(`${base()}/importar-excel?confirmar=true`, archivo, nombre);

  beforeAll(async () => {
    process.env['PERMISOS_MODO'] = 'estricto';
    db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
    await db.connect();
    await crearUsuarioE2E(db);
    const anexo = async (nombre: string, tipo: string) => (await db.query(`insert into anexos ("tipoAnexo", "Anexo", estado) values ($1, $2, true) returning id`, [tipo, nombre])).rows[0].id as number;
    cliente = await anexo('E2E-IMP Tambo', 'Cliente');
    jefe = await anexo('E2E-IMP Jefe', 'Trabajador');
    coord = await anexo('E2E-IMP Coord', 'Trabajador');
    cc = (await db.query(`insert into "CentroCostos" (centro_costo, estado, periodo, id_anexo) values ('E2E-IMP-A', 'ABIERTO', 2026, $1) returning id`, [cliente])).rows[0].id;
    ccOtra = (await db.query(`insert into "CentroCostos" (centro_costo, estado, periodo, id_anexo) values ('E2E-IMP-B', 'ABIERTO', 2026, $1) returning id`, [cliente])).rows[0].id;

    rolVerId = (await db.query(`insert into rol (nombre, descripcion, es_sistema) values ('E2E-IMP-VER', 'e2e', false) returning id`)).rows[0].id;
    await db.query(`insert into rol_permiso (rol_id, modulo_id, ver, crear, editar, eliminar, aprobar, anular) select $1, m.id, true, false, false, false, false, false from modulo m where m.clave = 'obra'`, [rolVerId]);
    await db.query(`insert into usuarios ("IdUsuario", "Nombres", "Usuario", "Clave", "Rol", activo, id_area) values ('E2E-IMP-VER', 'Solo ver', 'e2e-imp-ver', null, 'E2E-IMP-VER', true, null)`);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    if (modoAnterior === undefined) delete process.env['PERMISOS_MODO'];
    else process.env['PERMISOS_MODO'] = modoAnterior;
    if (db) {
      await db.query(`delete from "CentroCostos" where centro_costo like 'E2E-IMP-%'`);
      await db.query(`delete from usuarios where "IdUsuario" = 'E2E-IMP-VER'`);
      await db.query(`delete from rol where id = $1`, [rolVerId]);
      await db.query(`delete from anexos where "Anexo" like 'E2E-IMP %'`);
      await borrarUsuarioE2E(db);
      await db.end();
    }
    await app?.close();
  });

  const filas = async (tabla: string) => Number((await db.query(`select count(*)::int as n from ${tabla} where id_centro_costo = $1`, [cc])).rows[0].n);

  describe('permisos y archivo', () => {
    it('con solo «ver» sobre la obra no se puede importar', async () => {
      const auth = `Bearer ${jwt.sign({ sub: 'E2E-IMP-VER', usuario: 'e2e-imp-ver', rol: 'E2E-IMP-VER' })}`;
      // Sin adjunto: el guard responde 403 antes de leer el cuerpo y un archivo grande provocaría un reset de conexión.
      await request(app.getHttpServer()).post(`${base()}/importar-excel`).set('Authorization', auth).expect(403);
    });

    it('sin archivo, con otra extensión o con un libro que no es la plantilla, 400', async () => {
      await previa(null).expect(400);
      await previa(Buffer.from('hola'), 'notas.txt').expect(400);
      await previa(Buffer.from('no soy un excel'), 'roto.xlsx').expect(400);
      const otro = new ExcelJS.Workbook();
      otro.addWorksheet('Obras').addRow(['Cliente', 'Tienda']);
      const r = await previa(Buffer.from(await otro.xlsx.writeBuffer()), 'otro.xlsx').expect(400);
      expect(r.body.message).toContain('plantilla por proyecto');
    });

    it('en un centro de costo que no existe, 404', async () => {
      await subir('/operaciones/obra/99999999/importar-excel', await excel()).expect(404);
    });
  });

  describe('vista previa (no escribe nada)', () => {
    it('lee la ficha, cuenta lo que trae y reconoce al equipo', async () => {
      const r = await previa(await excel()).expect(201);
      expect(r.body).toMatchObject({
        importable: true,
        reemplaza_estructura: false,
        errores: [],
        ficha: { codigo: 'E2E-IMP-017', estado: 'EN_EJECUCION', inicio: '2026-09-17', fin: '2026-10-26' },
      });
      expect(r.body.resumen.subpartidas).toBeGreaterThan(20);
      expect(r.body.resumen.subpartidas_con_avance).toBeGreaterThan(5);
      const jefeFila = r.body.equipo.find((e: { rol: string }) => e.rol === 'jefe_proyecto');
      expect(jefeFila.persona).toMatchObject({ id: jefe, nombre: 'E2E-IMP Jefe' });
      // residente y responsables del archivo no están en el maestro de la BD de pruebas: solo avisos
      expect(r.body.avisos.length).toBeGreaterThan(0);
    });

    it('no toca la BD', async () => {
      expect(await filas('obra_partida')).toBe(0);
      expect(await filas('obra_reprogramacion')).toBe(0);
      expect(await filas('obra_datos_generales')).toBe(0);
      expect((await db.query(`select fecha_inicio from "CentroCostos" where id = $1`, [cc])).rows[0].fecha_inicio).toBeNull();
    });

    it('un jefe que no está en el maestro es un error (la obra no tiene otro)', async () => {
      const r = await previa(await excel({ 'Jefe de proyecto': 'Persona Inexistente Zeta' })).expect(201);
      expect(r.body.importable).toBe(false);
      expect(r.body.errores.map((e: { mensaje: string }) => e.mensaje).join()).toContain('no está en el maestro de Trabajadores');
    });

    it('lo que falta en la ficha también bloquea', async () => {
      const r = await previa(await excel({ 'Código de obra': null, Coordinador: null })).expect(201);
      expect(r.body.importable).toBe(false);
      const msgs = r.body.errores.map((e: { mensaje: string }) => e.mensaje);
      expect(msgs).toContain('falta el código de obra');
      expect(msgs).toContain('falta el coordinador');
    });

    it('confirmar con errores, 400 con la lista', async () => {
      const r = await importar(await excel({ 'Código de obra': null })).expect(400);
      expect(r.body.errores.length).toBeGreaterThan(0);
      expect(await filas('obra_partida')).toBe(0);
    });

    it('el código de otra obra es un error', async () => {
      await db.query(`insert into obra_datos_generales (id_centro_costo, codigo_obra) values ($1, 'E2E-IMP-017')`, [ccOtra]);
      const r = await previa(await excel()).expect(201);
      expect(r.body.errores.map((e: { mensaje: string }) => e.mensaje).join()).toContain('ya lo usa otra obra');
      await db.query(`delete from obra_datos_generales where id_centro_costo = $1`, [ccOtra]);
    });
  });

  describe('importación', () => {
    it('importa la ficha, la estructura y el avance, y el motor da lo mismo que Excel', async () => {
      const r = await importar(await excel()).expect(201);
      expect(r.body.importado).toBe(true);

      const ctl = (await api().get(`${base()}/control?hoy=${GOLDEN.hoySugerido}`).expect(200)).body;
      expect(ctl).toMatchObject({ configurada: true, estado_obra: 'EN_EJECUCION', ficha: { codigo_obra: 'E2E-IMP-017', tienda: 'Pacasmayo Callao' } });
      expect(ctl.ficha.equipo.jefe_proyecto).toMatchObject({ id: jefe });
      expect(ctl.ficha.equipo.coordinador).toMatchObject({ id: coord });
      // Lo que calculó el Excel del jefe: 83 % real y 83 % programado, semana 6, fin 26/10.
      expect(Math.floor(ctl.resultado.real)).toBe(GOLDEN.esperadoObra.realPct);
      expect(Math.floor(ctl.resultado.programado)).toBe(GOLDEN.esperadoObra.programadoPct);
      expect(ctl.resultado.semana.actual).toBe(GOLDEN.esperadoObra.semanaEnCurso);
      expect(ctl.resultado.plazos.finVigente).toBe(GOLDEN.esperadoObra.finVigente);
    });

    it('las fechas de la obra quedaron en el centro de costo', async () => {
      const f = (await db.query(`select fecha_inicio::text as i, fecha_fin_prog::text as f from "CentroCostos" where id = $1`, [cc])).rows[0];
      expect(f).toEqual({ i: '2026-09-17', f: '2026-10-26' });
    });

    it('la estructura trae las partidas del archivo, con ítems y tipos, y sin metas manuales (eran fórmulas)', async () => {
      const partidas = (await api().get(`${base()}/partidas`).expect(200)).body as { item: string; subpartidas: { metas_manuales: (number | null)[]; tiene_avance: boolean }[] }[];
      expect(partidas.length).toBe(11);
      expect(partidas[0].item).toBe('01');
      expect(partidas.flatMap((p) => p.subpartidas).every((s) => s.metas_manuales.every((m) => m === null))).toBe(true);
      expect(partidas.flatMap((p) => p.subpartidas).some((s) => s.tiene_avance)).toBe(true);
    });

    it('queda un evento de la importación', async () => {
      const ev = (await api().get(`${base()}/eventos?limite=20`).expect(200)).body as { tipo: string; titulo: string }[];
      expect(ev.some((e) => e.tipo === 'ALTA' && e.titulo.startsWith('Importado desde Excel'))).toBe(true);
    });

    it('con avance ya registrado no se puede volver a importar sobre la estructura', async () => {
      const p = await previa(await excel()).expect(201);
      expect(p.body.importable).toBe(false);
      expect(p.body.errores.map((e: { mensaje: string }) => e.mensaje).join()).toContain('ya tiene avance registrado');
      const r = await importar(await excel()).expect(400);
      expect(r.body.errores.length).toBeGreaterThan(0);
    });
  });

  describe('reprogramaciones y reemplazo', () => {
    it('importa las reprogramaciones del archivo y reemplaza las que había', async () => {
      // Obra B sin avance: se puede reemplazar su estructura.
      const archivo = await excel({ 'Código de obra': 'E2E-IMP-018' });
      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load(archivo as unknown as ExcelJS.Buffer);
      const rep = libro.getWorksheet('Reprogramaciones')!;
      // La primera fila de datos está bajo la cabecera «Desde / Días / Motivo»
      let cab = 0;
      rep.eachRow((row, n) => {
        if (!cab && String(row.getCell(2).value ?? '').toLowerCase().startsWith('desde')) cab = n;
        if (!cab && String(row.getCell(3).value ?? '').toLowerCase().startsWith('desde')) cab = n;
      });
      expect(cab).toBeGreaterThan(0);
      const colDesde = [1, 2, 3, 4].find((c) => String(rep.getRow(cab).getCell(c).value ?? '').toLowerCase().startsWith('desde'))!;
      const fila = rep.getRow(cab + 1);
      fila.getCell(colDesde).value = new Date(Date.UTC(2026, 9, 5));
      fila.getCell(colDesde + 1).value = 7;
      fila.getCell(colDesde + 2).value = 'Cliente';
      fila.getCell(colDesde + 3).value = 'Cambio de local';
      const conRep = Buffer.from(await libro.xlsx.writeBuffer());

      // Estado previo en la obra B: una reprogramación manual
      await db.query(`insert into obra_reprogramacion (id_centro_costo, desde, dias, motivo) values ($1, '2026-10-01', 2, 'CLIENTE')`, [ccOtra]);
      const url = `/operaciones/obra/${ccOtra}/importar-excel`;
      const p = await subir(url, conRep).expect(201);
      expect(p.body.importable).toBe(true);
      expect(p.body.resumen.reprogramaciones).toBe(1);
      expect(p.body.avisos.map((a: { mensaje: string }) => a.mensaje).join()).toContain('reemplaza las 1 reprogramación');

      await subir(`${url}?confirmar=true`, conRep).expect(201);
      const lista = (await api().get(`/operaciones/obra/${ccOtra}/reprogramaciones`).expect(200)).body as { desde: string; dias: number; motivo: string; detalle: string | null }[];
      expect(lista).toHaveLength(1);
      expect(lista[0]).toMatchObject({ desde: '2026-10-05', dias: 7, motivo: 'CLIENTE', detalle: 'Cambio de local' });
    });
  });
});
