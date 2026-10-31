import { normT } from './excel-proyecto.js';

export interface PersonaCandidata {
  id: number;
  nombre: string;
}

export type ResultadoBusqueda = { persona: PersonaCandidata } | { persona: null; motivo: 'vacio' | 'sin-coincidencia' | 'ambiguo'; candidatos: string[] };

const palabras = (s: string): string[] =>
  normT(s)
    .replace(/[.,;]/g, ' ')
    .split(' ')
    .filter(Boolean);

/**
 * Busca en el maestro de trabajadores a quien el Excel nombra («Melissa G.», «Abel Narvaez»).
 * Primero el nombre exacto; si no, que cada palabra escrita sea el comienzo de una palabra del
 * nombre completo (así «Melissa G.» encuentra a «Melissa García»). Solo se acepta si hay UNA coincidencia.
 */
export function buscarPersona(texto: string, personas: readonly PersonaCandidata[]): ResultadoBusqueda {
  const buscado = palabras(texto);
  if (buscado.length === 0) return { persona: null, motivo: 'vacio', candidatos: [] };

  const exactos = personas.filter((p) => normT(p.nombre) === normT(texto));
  if (exactos.length === 1) return { persona: exactos[0] };

  const parecidos = personas.filter((p) => {
    const nombre = palabras(p.nombre);
    return buscado.every((b) => nombre.some((n) => n.startsWith(b)));
  });
  if (parecidos.length === 1) return { persona: parecidos[0] };
  if (parecidos.length > 1) return { persona: null, motivo: 'ambiguo', candidatos: parecidos.slice(0, 5).map((p) => p.nombre) };
  return { persona: null, motivo: 'sin-coincidencia', candidatos: [] };
}
