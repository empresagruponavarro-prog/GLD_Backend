import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

/** Una fila de la tabla ITEM / MODELO / MARCA / SERIE / ENTREGA / DESCRIPCIÓN / N° / OBSERVACIONES. */
export interface FilaEntrega {
  modelo: string;
  marca: string;
  serie: string;
  descripcion: string;
  cantidad: number;
  observaciones: string;
}

export interface DatosEntrega {
  nombre: string;
  dni: string;
  /** yyyy-MM-dd */
  fecha: string;
  filas: FilaEntrega[];
}

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const PLANTILLA = new URL('./plantillas/entrega-equipos.docx', import.meta.url);

/** La plantilla no cambia entre descargas: se lee del disco una sola vez. */
let plantillaEnMemoria: Promise<Buffer> | undefined;

function leerPlantilla(): Promise<Buffer> {
  plantillaEnMemoria ??= readFile(PLANTILLA).catch((error: unknown) => {
    plantillaEnMemoria = undefined;
    throw error;
  });
  return plantillaEnMemoria;
}

/** Textos de relleno de la plantilla (en el orden en que aparecen): nombre, DNI, nombre, DNI, nombre, DNI. */
const PLACEHOLDER = /^x+$/;

/** Número de 1 o 2 dígitos (día o mes) y año de 4 dígitos, tal como Word los guarda en sus runs. */
const DIA_O_MES = /^\d{1,2}$/;
const ANIO = /^\d{4}$/;

/** Cuántos nodos de texto como máximo separan el ancla de su fecha (los runs intermedios son espacios y «/»). */
const VENTANA_FECHA = 8;

function escaparXml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const NODO_TEXTO = /(<w:t(?: [^>]*)?>)([^<]*)(<\/w:t>)/g;

/** Filas y celdas de tabla: Word las guarda con o sin atributos (`w:rsidR`, `w14:paraId`...). */
const FILA_XML = /<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g;
const CELDA_XML = /<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g;

/** Cambia el contenido del primer `<w:t>` de un fragmento XML. */
function cambiarPrimerTexto(xml: string, texto: string): string {
  let hecho = false;
  return xml.replace(NODO_TEXTO, (todo, abre: string, _viejo: string, cierra: string) => {
    if (hecho) return todo;
    hecho = true;
    const abreConEspacios = abre.includes('xml:space') ? abre : abre.replace('<w:t', '<w:t xml:space="preserve"');
    return `${abreConEspacios}${escaparXml(texto)}${cierra}`;
  });
}

/** Reemplaza el texto de los nodos `<w:t>` según una función que recibe el nodo y su posición. */
function mapearTextos(xml: string, fn: (texto: string, indice: number) => string | null): string {
  let indice = -1;
  return xml.replace(NODO_TEXTO, (todo, abre: string, texto: string, cierra: string) => {
    indice++;
    const nuevo = fn(texto, indice);
    return nuevo === null ? todo : `${abre}${escaparXml(nuevo)}${cierra}`;
  });
}

function partesFecha(iso: string): { dia: string; mes: string; anio: string; diaNum: string; mesNum: string } {
  const [anio = '', mesNum = '', diaNum = ''] = iso.split('-');
  const nombreMes = MESES[Number(mesNum) - 1] ?? mesNum;
  return { dia: String(Number(diaNum)), mes: nombreMes, anio, diaNum, mesNum };
}

/** Primer nodo desde `desde` cuyo texto (sin espacios) cumple `cumple`; `-1` si no hay. */
function buscarDesde(textos: string[], desde: number, cumple: (texto: string) => boolean): number {
  for (let i = Math.max(desde, 0); i < textos.length; i++) {
    if (cumple((textos[i] ?? '').trim())) return i;
  }
  return -1;
}

/**
 * Ubica los tres nodos (día, mes, año) de una fecha que viene después de un texto ancla, sin depender
 * del valor de ejemplo que traiga la plantilla: se buscan por forma (dígitos o nombre de mes) y cerca del ancla.
 */
function ubicarFecha(
  textos: string[],
  anclaje: string,
  esMes: (texto: string) => boolean,
  descripcion: string,
): [number, number, number] {
  const ancla = textos.findIndex((t) => t.includes(anclaje));
  const dia = ancla < 0 ? -1 : buscarDesde(textos, ancla + 1, (t) => DIA_O_MES.test(t));
  const mes = dia < 0 ? -1 : buscarDesde(textos, dia + 1, esMes);
  const anio = mes < 0 ? -1 : buscarDesde(textos, mes + 1, (t) => ANIO.test(t));
  if (anio < 0 || anio - ancla > VENTANA_FECHA) {
    throw new Error(`La plantilla de entrega cambió: no se encontró la fecha ${descripcion}`);
  }
  return [dia, mes, anio];
}

/** Rellena la plantilla «ENTREGA DE EQUIPOS» con quien recibe, la fecha y los equipos entregados. */
export async function generarEntregaDocx(datos: DatosEntrega): Promise<Buffer> {
  const zip = await JSZip.loadAsync(await leerPlantilla());
  const archivo = zip.file('word/document.xml');
  if (!archivo) throw new Error('La plantilla de entrega no tiene word/document.xml');
  let xml = await archivo.async('string');

  const { dia, mes, anio, diaNum, mesNum } = partesFecha(datos.fecha);
  const reemplazosX = [datos.nombre, datos.dni, datos.nombre, datos.dni, datos.nombre, datos.dni];
  let siguienteX = 0;
  const textos = [...xml.matchAll(NODO_TEXTO)].map((m) => m[2] ?? '');

  // «FECHA:» del encabezado (dd / mm / aaaa, partida en runs) y «a partir del día dd de Mes del aaaa».
  const [hDia, hMes, hAnio] = ubicarFecha(textos, 'FECHA:', (t) => DIA_O_MES.test(t), 'del encabezado');
  const [aDia, aMes, aAnio] = ubicarFecha(textos, 'a partir del día', (t) => MESES.includes(t), 'de la autorización');
  const fechas = new Map<number, string>([
    [hDia, diaNum],
    [hMes, mesNum],
    [hAnio, anio],
    [aDia, dia],
    [aMes, mes],
    [aAnio, anio],
  ]);

  xml = mapearTextos(xml, (texto, i) => {
    if (PLACEHOLDER.test(texto)) return reemplazosX[siguienteX++] ?? texto;
    return fechas.get(i) ?? null;
  });
  if (siguienteX !== reemplazosX.length) throw new Error('La plantilla de entrega cambió: faltan datos por completar');

  // Quita «(Nombre): » si persiste en la plantilla y centra el nombre y DNI bajo la línea de firma
  xml = xml.replace(/(<w:p [^>]*paraId="7B49C1E8"[^>]*>)(?:<w:pPr>[\s\S]*?<\/w:pPr>)?([\s\S]*?<\/w:p>)/, (_todo, abreP, cuerpo) => {
    const cuerpoLimpio = cuerpo
      .replace(/<w:r[^>]*><w:rPr><w:rStyle w:val="selectable-text"\/><\/w:rPr><w:t>\(<\/w:t><\/w:r>/g, '')
      .replace(/<w:r[^>]*><w:rPr><w:rStyle w:val="selectable-text"\/><\/w:rPr><w:t>Nombre<\/w:t><\/w:r>/g, '')
      .replace(/<w:r[^>]*><w:rPr><w:rStyle w:val="selectable-text"\/><\/w:rPr><w:t>\)<\/w:t><\/w:r>/g, '')
      .replace(/<w:r[^>]*><w:rPr><w:rStyle w:val="selectable-text"\/><\/w:rPr><w:t xml:space="preserve">: <\/w:t><\/w:r>/g, '')
      .replace(/<w:t xml:space="preserve">\s+<\/w:t>/g, '');
    const pPr = '<w:pPr><w:jc w:val="center"/><w:ind w:left="2229" w:right="2941"/><w:rPr><w:lang w:val="es-PE"/></w:rPr></w:pPr>';
    return `${abreP}${pPr}${cuerpoLimpio}`;
  });

  xml = reemplazarFilas(xml, datos.filas);
  zip.file('word/document.xml', xml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * La plantilla trae filas de ejemplo (LAPTOP, Estuche...): se sustituyen por los equipos reales.
 * Una fila de ejemplo es cualquiera que tenga «OK» en la columna ENTREGA; no importa qué equipo describa.
 */
function reemplazarFilas(xml: string, filas: FilaEntrega[]): string {
  const ejemplos = [...xml.matchAll(FILA_XML)]
    .map((m) => m[0])
    .filter((fila) => [...fila.matchAll(NODO_TEXTO)].some((m) => (m[2] ?? '').trim() === 'OK'));
  const [ejemplo] = ejemplos;
  if (!ejemplo) throw new Error('La plantilla de entrega cambió: no se encontraron las filas de ejemplo');

  const nuevas = filas.map((fila, i) => {
    const valores = [String(i + 1), fila.modelo, fila.marca, fila.serie, 'OK', fila.descripcion, String(fila.cantidad), fila.observaciones];
    let celda = 0;
    // Las celdas 1 a 8 son las del cuadro; la primera y las dos últimas son márgenes vacíos.
    return ejemplo.replace(CELDA_XML, (tc) => {
      const actual = celda++;
      return actual >= 1 && actual <= 8 ? cambiarPrimerTexto(tc, valores[actual - 1] ?? '') : tc;
    });
  });

  let resultado = xml;
  ejemplos.forEach((fila, i) => {
    resultado = resultado.replace(fila, () => (i === 0 ? nuevas.join('') : ''));
  });
  return resultado;
}
