import { getMetadataStorage } from 'class-validator';
import { defaultMetadataStorage } from 'class-transformer/cjs/storage.js';

/**
 * Textos en mayúsculas (GRP S-11, DG9). Lo que escribe la gente en el cuerpo de una petición se guarda en mayúsculas, salvo lo
 * que no es un texto libre: correos, usuarios, claves, enlaces, rutas y archivos, observaciones y comentarios, justificaciones,
 * tokens y códigos (`Id…`), y los campos que se validan contra un conjunto fijo de valores con minúsculas («En Planta»).
 */

/** Claves cuyo valor no se convierte (insensible a mayúsculas). */
export const PATRON_CLAVES_EXCLUIDAS = /(correo|email|usuario|password|clave|contrasena|url|ruta|archivo|file|observ|comentario|justificacion|token)/i;

/** Códigos: `IdPresupuesto`, `IdOC`, `id_oc`… (no `identificacion`, que es un texto normal). */
export const PATRON_CODIGOS = /^(Id[A-Z_]|id_|id$)/;

/** Campos marcados con `@SinMayusculasCampo()` (por nombre; se llena al cargar los DTO). */
export const CAMPOS_SIN_MAYUSCULAS = new Set<string>();

type Clase = Function;

/** ¿Alguno de los valores permitidos cambiaría al pasar a mayúsculas? Los que ya son mayúsculas no necesitan exclusión. */
const algunValorCambia = (valores: unknown): boolean =>
  Array.isArray(valores) && valores.some((v) => typeof v === 'string' && v !== v.toUpperCase());

const cacheFijos = new WeakMap<Clase, ReadonlySet<string>>();

/**
 * Propiedades de **un DTO** que validan con `@IsIn`/`@IsEnum` contra valores con minúsculas (incluye las heredadas). Es por
 * clase —no global— para que un `direccion` de texto libre no se confunda con otro `direccion` que sea un orden `asc/desc`.
 */
export function camposConValoresFijos(clase: Clase): ReadonlySet<string> {
  const guardado = cacheFijos.get(clase);
  if (guardado) return guardado;
  const nombres = new Set<string>();
  for (const m of getMetadataStorage().getTargetValidationMetadatas(clase, '', true, false)) {
    // isIn: constraints[0] = valores; isEnum: constraints[1] = valores válidos.
    const cambia = m.name === 'isIn' ? algunValorCambia(m.constraints?.[0]) : m.name === 'isEnum' ? algunValorCambia(m.constraints?.[1]) : false;
    if (cambia) nombres.add(m.propertyName);
  }
  cacheFijos.set(clase, nombres);
  return nombres;
}

const PRIMITIVOS: ReadonlySet<unknown> = new Set([String, Number, Boolean, Date, Object, Array, BigInt, Symbol]);

/** DTO de una propiedad anidada (`@Type(() => Linea)`), si lo declara. */
function claseAnidada(clase: Clase | undefined, propiedad: string): Clase | undefined {
  if (!clase) return undefined;
  try {
    const tipo = defaultMetadataStorage.findTypeMetadata(clase, propiedad)?.typeFunction();
    return typeof tipo === 'function' && !PRIMITIVOS.has(tipo) ? tipo : undefined;
  } catch {
    return undefined;
  }
}

/** ¿El valor de esta propiedad queda tal cual? `dueña` es el DTO del objeto que la contiene (si se conoce). */
export function claveExcluida(clave: string, dueña?: Clase): boolean {
  return PATRON_CLAVES_EXCLUIDAS.test(clave) || PATRON_CODIGOS.test(clave) || CAMPOS_SIN_MAYUSCULAS.has(clave) || (dueña !== undefined && camposConValoresFijos(dueña).has(clave));
}

const esObjetoPlano = (v: unknown): v is Record<string, unknown> => {
  if (typeof v !== 'object' || v === null) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/**
 * Convierte a mayúsculas todos los textos de un valor JSON (objetos y listas anidados), salvo los excluidos (ver
 * {@link claveExcluida}). `dto` es la clase del cuerpo, si se conoce: con ella se respetan los campos de valores fijos de ese
 * DTO y de los anidados. Los números, booleanos, fechas y objetos que no son planos (archivos, buffers) quedan igual. No
 * muta la entrada.
 *
 * @param dueña DTO del objeto que contiene `clave` (uso interno de la recursión).
 */
export function aMayusculas(valor: unknown, dto?: Clase, clave?: string, dueña: Clase | undefined = dto): unknown {
  if (typeof valor === 'string') return clave !== undefined && claveExcluida(clave, dueña) ? valor : valor.toUpperCase();
  if (Array.isArray(valor)) return valor.map((v) => aMayusculas(v, dto, clave, dueña));
  if (esObjetoPlano(valor)) {
    // Un objeto bajo una propiedad es del DTO anidado de esa propiedad; el cuerpo raíz es del DTO de la ruta.
    const clase = clave !== undefined ? claseAnidada(dueña, clave) : dueña;
    const salida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor)) salida[k] = aMayusculas(v, dto, k, clase);
    return salida;
  }
  return valor;
}
