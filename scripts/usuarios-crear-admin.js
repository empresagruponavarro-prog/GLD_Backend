#!/usr/bin/env node
// Crea (o, con confirmacion, actualiza) el usuario administrador.
// La clave se pide por consola dos veces sin mostrarla, o se toma de la
// variable de entorno ADMIN_CLAVE. Nunca se imprime.
//
//   npm run usuarios:crear-admin
//   npm run usuarios:crear-admin -- --usuario jefe --nombres "Jefe de Sistemas"
//   npm run usuarios:crear-admin -- --dry-run
//
// Lee DATABASE_URL de .env (via src/prisma/db.ts). Requiere Node >= 22.18.
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';

const ROL_ADMIN = 'Administrador';

const AYUDA = `Uso: npm run usuarios:crear-admin -- [opciones]

Crea el usuario administrador (rol "${ROL_ADMIN}") con la clave hasheada (argon2id).
Si el login ya existe, pide confirmacion y actualiza su clave y su rol.

Opciones:
  --usuario <login>    Login del administrador (por defecto: admin).
  --nombres "<texto>"  Nombres a guardar (por defecto: "Administrador").
  --si                 Confirma sin preguntar la actualizacion de un usuario existente.
  --dry-run            Solo muestra que haria; no pide la clave ni escribe en la BD.
  -h, --help           Muestra esta ayuda.

La clave (minimo 8 caracteres) se pide dos veces sin mostrarla. Para uso no
interactivo defina la variable de entorno ADMIN_CLAVE (p. ej. en Git Bash:
"read -s ADMIN_CLAVE && export ADMIN_CLAVE"; luego bórrela con "unset ADMIN_CLAVE").
En Git Bash (mintty) sin consola real use "winpty npm run usuarios:crear-admin" o ADMIN_CLAVE.`;

function salir(mensaje, codigo = 1) {
  console.error(mensaje);
  process.exit(codigo);
}

let opciones;
try {
  opciones = parseArgs({
    options: {
      usuario: { type: 'string', default: 'admin' },
      nombres: { type: 'string' },
      si: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  }).values;
} catch (error) {
  salir(`${error.message}\n\n${AYUDA}`, 2);
}
if (opciones.help) {
  console.log(AYUDA);
  process.exit(0);
}

const login = opciones.usuario.trim();
const nombres = opciones.nombres?.trim();
const dryRun = opciones['dry-run'];
if (!login || login.length > 255) salir('--usuario debe tener entre 1 y 255 caracteres.', 2);
if (nombres !== undefined && nombres.length > 255) salir('--nombres admite hasta 255 caracteres.', 2);

/** Lee una linea de la consola sin hacer eco (raw mode). */
function preguntarOculto(pregunta) {
  const stdin = process.stdin;
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    return Promise.reject(
      new Error(
        'La consola no permite ocultar la clave (stdin no es una TTY). ' +
          'Defina ADMIN_CLAVE o, en Git Bash, ejecute con "winpty".',
      ),
    );
  }
  return new Promise((resolve) => {
    let valor = '';
    process.stdout.write(pregunta);
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    const terminar = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write('\n');
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          terminar();
          resolve(valor);
          return;
        }
        if (ch === '\u0003') {
          terminar();
          salir('Cancelado.', 130);
        }
        if (ch === '\u007f' || ch === '\b') {
          valor = valor.slice(0, -1);
          continue;
        }
        if (ch >= ' ') valor += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function confirmar(pregunta) {
  if (opciones.si) return true;
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const r = (await rl.question(`${pregunta} (s/N) `)).trim().toLowerCase();
    return r === 's' || r === 'si' || r === 'sí';
  } finally {
    rl.close();
  }
}

function validarClave(clave, CLAVE_MIN, CLAVE_MAX) {
  if (clave.length < CLAVE_MIN) salir(`La clave debe tener al menos ${CLAVE_MIN} caracteres.`);
  if (clave.length > CLAVE_MAX) salir(`La clave admite hasta ${CLAVE_MAX} caracteres.`);
}

async function obtenerClave(CLAVE_MIN, CLAVE_MAX) {
  const deEntorno = process.env.ADMIN_CLAVE;
  if (deEntorno !== undefined && deEntorno !== '') {
    validarClave(deEntorno, CLAVE_MIN, CLAVE_MAX);
    console.log('Usando la clave de la variable de entorno ADMIN_CLAVE.');
    return deEntorno;
  }
  try {
    const clave = await preguntarOculto(`Clave para "${login}" (min. ${CLAVE_MIN} caracteres): `);
    validarClave(clave, CLAVE_MIN, CLAVE_MAX);
    const repetida = await preguntarOculto('Repita la clave: ');
    if (clave !== repetida) salir('Las claves no coinciden.');
    return clave;
  } catch (error) {
    salir(error.message);
  }
}

process.env.DOTENV_CONFIG_QUIET ??= 'true';
const { db } = await import('../src/prisma/db.ts');
const { hashClave, CLAVE_MIN, CLAVE_MAX } = await import('../src/platform/auth/usuarios/passwords.ts');
const { buscarUsuariosPorLogin } = await import('../src/platform/auth/usuarios/usuarios-login.ts');
const { siguienteIdUsuario } = await import('../src/platform/auth/usuarios/usuarios-id.ts');

await db.connect();
try {
  const existentes = await buscarUsuariosPorLogin(db, login);
  if (existentes.length > 1) {
    salir(`Hay ${existentes.length} usuarios con el login "${login}"; corrija los duplicados antes.`);
  }
  const existente = existentes[0];

  if (dryRun) {
    if (existente) {
      console.log(
        `--dry-run: el login "${login}" ya existe (IdUsuario ${existente.IdUsuario}, rol ${existente.Rol ?? '(sin rol)'}).`,
      );
      console.log(`Se pediria confirmacion para actualizar su clave y asignarle el rol ${ROL_ADMIN}.`);
    } else {
      console.log(`--dry-run: se crearia el usuario "${login}" con rol ${ROL_ADMIN}.`);
    }
    if (process.env.ADMIN_CLAVE) validarClave(process.env.ADMIN_CLAVE, CLAVE_MIN, CLAVE_MAX);
    console.log('No se modifico nada.');
  } else if (existente) {
    console.log(
      `El login "${login}" ya existe (IdUsuario ${existente.IdUsuario}, rol ${existente.Rol ?? '(sin rol)'}).`,
    );
    if (!(await confirmar(`¿Actualizar su clave, asignarle el rol ${ROL_ADMIN} y dejarlo activo?`))) {
      salir('Sin cambios (use --si para confirmar en modo no interactivo).');
    }
    const clave = await obtenerClave(CLAVE_MIN, CLAVE_MAX);
    // `activo: true`: tambien sirve para recuperar un administrador desactivado.
    const datos = { Clave: await hashClave(clave), Rol: ROL_ADMIN, activo: true };
    if (nombres) datos.Nombres = nombres;
    await db.orm.public.Usuarios.where({ IdUsuario: existente.IdUsuario }).update(datos);
    console.log(`Usuario "${login}" actualizado con rol ${ROL_ADMIN}.`);
  } else {
    const clave = await obtenerClave(CLAVE_MIN, CLAVE_MAX);
    // Mismo correlativo que el alta desde la pantalla (USR-0001, USR-0002…).
    const ids = (await db.orm.public.Usuarios.all()).map((u) => String(u.IdUsuario));
    const fila = await db.orm.public.Usuarios.create({
      IdUsuario: siguienteIdUsuario(ids),
      Nombres: nombres || 'Administrador',
      Usuario: login,
      Clave: await hashClave(clave),
      Rol: ROL_ADMIN,
    });
    console.log(`Usuario "${login}" creado (IdUsuario ${fila.IdUsuario}) con rol ${ROL_ADMIN}.`);
  }
} finally {
  await db.close();
}
