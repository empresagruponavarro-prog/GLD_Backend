/**
 * Cómo nacen los contratos de valorización (plan 12, integración §3.5), por la variable `VALORIZACIONES_ALTA`:
 * - `manual` (por defecto): aprobar un presupuesto no crea contratos; se crean con el botón. Todo se comporta como antes de este plan.
 * - `automatica`: cada orden de servicio registrada de un presupuesto recibe su contrato en borrador.
 * Se lee en cada llamada (no se cachea) para poder cambiarla sin reiniciar las pruebas. Volver a `manual` no borra contratos: solo deja de crearlos.
 */
export const MODOS_ALTA = ['manual', 'automatica'] as const;
export type ModoAlta = (typeof MODOS_ALTA)[number];

export function leerModoAlta(env: Readonly<Record<string, string | undefined>> = process.env): ModoAlta {
  const crudo = (env['VALORIZACIONES_ALTA'] ?? '').trim().toLowerCase();
  return crudo === 'automatica' ? 'automatica' : 'manual';
}

export const altaAutomatica = (): boolean => leerModoAlta() === 'automatica';
