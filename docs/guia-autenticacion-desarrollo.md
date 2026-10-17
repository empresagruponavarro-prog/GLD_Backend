# Guía: poner al día tu entorno con login, roles y permisos

Para quien trabaja en GLD desde su propia máquina y aún no tiene la autenticación.
Desde esta versión **toda la API exige sesión** (salvo el login) y cada pantalla y endpoint está
controlado por **roles y permisos por módulo**. Sin estos pasos, el backend no arranca o no podrás entrar.

> Nunca compartas tu `.env`, tu `JWT_SECRET` ni contraseñas por chat. Si necesitas que alguien
> revise tu `.env`, tapa los valores: `JWT_SECRET=***`.

## 1. Requisitos
- Node **22.22.3 o superior** (`node -v`).
- PostgreSQL **15 o superior** en tu máquina, con tu copia de la base de datos de GLD.

## 2. Bajar los cambios
```bash
cd GLD_Backend && git pull && npm install
cd ../GLD_Frontend1 && git pull && bun install --frozen-lockfile   # o: npm ci
```

## 3. Configurar el `.env` del backend
Copia `.env.example` a `.env` (en `GLD_Backend/`) y completa:

```
PORT=3000
DATABASE_URL="postgresql://<usuario>:<clave>@localhost:5432/<tu_bd>"
JWT_SECRET=<genera el tuyo, ver abajo>
ALLOW_LOCAL_STORAGE=false
PERMISOS_MODO=auditoria
```

| Variable | Qué es | Qué poner |
| -------- | ------ | --------- |
| `DATABASE_URL` | Conexión a **tu** PostgreSQL local | Tu usuario, clave y nombre de BD |
| `JWT_SECRET` | Llave con la que el backend firma las sesiones. **Obligatoria, mínimo 32 caracteres**: sin ella el backend no arranca | Una propia, generada con el comando de abajo. **No uses la del servidor ni la de otro compañero** |
| `ALLOW_LOCAL_STORAGE` | Si la subida de planos/documentos guarda archivos en el disco | `false` (aún se está decidiendo dónde se guardan) |
| `PERMISOS_MODO` | Qué hace la API si un rol no tiene permiso: `auditoria` lo registra y deja pasar; `estricto` lo bloquea (403) | `auditoria` para desarrollar |

Generar tu `JWT_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## 4. Actualizar tu base de datos

**4.1 Copia de seguridad** (las migraciones cambian tablas):
```bash
pg_dump -U <usuario> -h localhost -d <tu_bd> -F c -f <tu_bd>-antes-auth.dump
```

**4.2 Ver qué falta, sin aplicar nada:**
```bash
npx prisma migration status
npx prisma db migrate --show --to db
```
Lo normal es que aparezcan pendientes `20261014T1753_roles_catalogo`,
`20261014T1810_quitar_cip_cap_residentes` y `20261015T1659_roles_permisos`. Si aparece algo distinto
(migraciones antiguas, errores o “drift”), **para y consúltalo** antes de seguir.

**4.3 Aplicar:**
```bash
npx prisma db migrate --to db
```
No uses `--advance-ref` ni edites `migrations/app/refs/db.json`: ese archivo viene del repositorio.

Esto crea:
- la tabla `rol` (Administrador, Gerente, Jefe de Área, Usuario…);
- el catálogo de módulos (`modulo`) y la matriz de permisos (`rol_permiso`);
- la columna `usuarios.activo`.

Los roles existentes reciben todos los permisos menos los de Administración.

## 5. Usuarios
El login nuevo **solo acepta contraseñas cifradas** (argon2id).

```bash
npm run usuarios:hash-claves          # cifra las contraseñas antiguas en texto plano, si las hay
winpty npm run usuarios:crear-admin   # crea (o recupera) el usuario "admin"; pide la clave dos veces
```
En Git Bash / MSYS2 hace falta `winpty` para que pida la clave. En PowerShell o CMD no:
`npm run usuarios:crear-admin`.

## 6. Arrancar y entrar
```bash
cd GLD_Backend && npm run start:dev     # http://localhost:3000  (Swagger en /api)
cd GLD_Frontend1 && npm start           # http://localhost:4200
```
Entra en `http://localhost:4200` con `admin` y la clave que pusiste.

**Swagger con sesión:**
1. Ejecuta `POST /auth/login` con `{ "usuario": "admin", "clave": "..." }`.
2. Copia el `token` de la respuesta.
3. Pégalo en el botón **Authorize** de Swagger, arriba a la derecha.

La sesión dura 8 horas.

## 7. Al programar: lo que cambia

### Backend
- **Todo controlador nuevo necesita su módulo:** `@Modulo('clave.del.modulo')` en la clase. Hay un test
  (`src/platform/auth/cobertura-permisos.spec.ts`) que **falla** si una ruta queda sin clasificar.
- La acción se deduce del verbo HTTP: GET → ver, POST → crear, PUT/PATCH → editar, DELETE → eliminar.
- **Decoradores disponibles:**
  - `@Accion('aprobar' | 'anular' | …)` en métodos especiales.
  - `@LecturaCompartida()` en lecturas que usan otros módulos (combos, buscadores). Solo exige sesión.
  - `@TambienDesde('otro.modulo')` cuando una pantalla de otro módulo necesita ese endpoint.
  - `@Public()` solo para rutas sin sesión.
- **Usuario de la sesión:** `@CurrentUser()`. Su rol se lee de la BD en cada petición.
- **Módulo nuevo del catálogo:**
  - añadirlo con una migración (semilla de `modulo`);
  - añadirlo a `CLAVES_MODULO` en el backend (`src/platform/auth/permisos.ts`);
  - y también en el frontend (`src/app/core/auth/permisos.models.ts`).
- Referencia completa (qué módulo y acción tiene cada endpoint): `planes/05-roles-y-permisos.md`, anexo §7.3.

### Frontend
- **Ruta nueva:** `rutaModulo('ruta', Componente, 'clave.del.modulo')` en `app.routes.ts`.
- **Enlace del menú:** en `src/app/core/sidebar/sidebar.menu.ts`, con su `modulo`.
- **Botones según permiso:** `permisosDePantalla()` (`src/app/core/auth/permisos-pantalla.ts`) da
  `crear`, `editar`, `eliminar`, `aprobar` y `anular`. Se ocultan con `@if`. Ejemplos en
  `features/tesoreria/pagos/` o `features/almacen/prestamos/`.
- **Sin `any`:** todo tipado con los modelos del dominio.

## 8. Tests
- `npm run test` (backend) y `npm run verify` (frontend) no necesitan nada más.
- Los e2e del backend (`npm run test:e2e`) **escriben en tu BD** y limpian lo que crean, incluido un
  usuario temporal `E2E-ADMIN`. Algunos casos esperan datos que tu BD puede no tener (p. ej. el almacén 2).

## 9. Problemas frecuentes
| Síntoma | Causa | Solución |
| ------- | ----- | -------- |
| El backend no arranca y habla del JWT | Falta `JWT_SECRET` o tiene menos de 32 caracteres | Genera uno (paso 3) |
| "Usuario o contraseña incorrectos" con la clave correcta | El usuario no existe o tiene la clave sin cifrar | `usuarios:hash-claves` y/o `usuarios:crear-admin` |
| "Tu usuario está desactivado" | `usuarios.activo = false` | Reactivarlo desde la pantalla Usuarios con otro admin, o `usuarios:crear-admin --usuario <login>` |
| Todo responde 401 | Token vencido (8 h) o falta `Authorization: Bearer` | Volver a entrar / Authorize en Swagger |
| 403 "No tienes permiso…" | Al rol le falta ese permiso (Administración siempre bloquea) | Marcarlo en **Roles y permisos** |
| Un menú no aparece | El rol no tiene **Ver** en ese módulo | Marcarlo en **Roles y permisos** |
| Error de columna `activo` o tabla `modulo` | No aplicaste las migraciones | Paso 4 |
