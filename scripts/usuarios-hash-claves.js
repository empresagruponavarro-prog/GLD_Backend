#!/usr/bin/env node
// Convierte a argon2id las claves de `usuarios` guardadas en texto plano.
// Idempotente: salta las que ya son hash. Nunca imprime claves.
//
//   npm run usuarios:hash-claves -- --dry-run   (solo cuenta, no escribe)
//   npm run usuarios:hash-claves                (aplica)
//
// Lee DATABASE_URL de .env (via src/prisma/db.ts). Requiere Node >= 22.18
// (importa los .ts del proyecto con el type-stripping nativo de Node).
import { parseArgs } from 'node:util';

const AYUDA = `Uso: npm run usuarios:hash-claves -- [--dry-run]

Convierte a argon2id las claves en texto plano de la tabla "usuarios".
Las claves que ya son hash argon2 se dejan igual (se puede ejecutar varias veces).

Opciones:
  --dry-run   Solo cuenta cuantas claves se convertirian; no escribe en la BD.
  -h, --help  Muestra esta ayuda.`;

let opciones;
try {
  opciones = parseArgs({
    options: {
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  }).values;
} catch (error) {
  console.error(`${error.message}\n\n${AYUDA}`);
  process.exit(2);
}
if (opciones.help) {
  console.log(AYUDA);
  process.exit(0);
}

process.env.DOTENV_CONFIG_QUIET ??= 'true';
const { db } = await import('../src/prisma/db.ts');
const { esHashArgon2, hashClave } = await import('../src/platform/auth/passwords.ts');

const dryRun = opciones['dry-run'];
await db.connect();
try {
  const filas = await db.orm.public.Usuarios.all();
  const pendientes = [];
  let yaHasheadas = 0;
  let sinClave = 0;
  for (const u of filas) {
    if (u.Clave == null || String(u.Clave) === '') sinClave++;
    else if (esHashArgon2(String(u.Clave))) yaHasheadas++;
    else pendientes.push(u);
  }

  console.log(`Usuarios: ${filas.length}`);
  console.log(`  ya con hash argon2: ${yaHasheadas}`);
  console.log(`  sin clave (no podran iniciar sesion): ${sinClave}`);
  console.log(`  en texto plano (a convertir): ${pendientes.length}`);

  if (dryRun) {
    console.log('\n--dry-run: no se modifico nada.');
  } else {
    let convertidas = 0;
    for (const u of pendientes) {
      const anterior = u.Clave;
      const nuevo = await hashClave(String(anterior));
      // Solo si la clave no cambio entretanto (otra ejecucion o un update).
      const fila = await db.orm.public.Usuarios.where({
        IdUsuario: u.IdUsuario,
        Clave: anterior,
      }).update({ Clave: nuevo });
      if (fila) convertidas++;
    }
    console.log(`\nClaves convertidas a argon2id: ${convertidas}`);
  }
} finally {
  await db.close();
}
