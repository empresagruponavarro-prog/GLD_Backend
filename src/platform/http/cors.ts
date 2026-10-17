/**
 * Orígenes (páginas web) que pueden llamar a la API desde el navegador.
 * Por defecto, el frontend publicado en el servidor y el de desarrollo (`ng serve`).
 * Se cambia con `CORS_ORIGENES` en el `.env` (lista separada por comas, sin barra final).
 */
export const ORIGENES_CORS_DEFECTO: readonly string[] = ['http://192.168.18.231', 'http://localhost:4200'];

/** Lee `CORS_ORIGENES`; si falta o queda vacía, usa {@link ORIGENES_CORS_DEFECTO}. */
export function origenesCors(env: Readonly<Record<string, string | undefined>>): string[] {
  const lista = (env['CORS_ORIGENES'] ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter((o) => o.length > 0);
  return lista.length > 0 ? lista : [...ORIGENES_CORS_DEFECTO];
}
