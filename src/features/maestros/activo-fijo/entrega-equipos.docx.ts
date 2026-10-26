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

/** Textos de relleno de la plantilla (en el orden en que aparecen): nombre, DNI, nombre, DNI, nombre, DNI. */
const PLACEHOLDER = /^x+$/;

function escaparXml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const NODO_TEXTO = /(<w:t(?: [^>]*)?>)([^<]*)(<\/w:t>)/g;

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

/** Rellena la plantilla «ENTREGA DE EQUIPOS» con quien recibe, la fecha y los equipos entregados. */
export async function generarEntregaDocx(datos: DatosEntrega): Promise<Buffer> {
  const zip = await JSZip.loadAsync(await readFile(PLANTILLA));
  const archivo = zip.file('word/document.xml');
  if (!archivo) throw new Error('La plantilla de entrega no tiene word/document.xml');
  let xml = await archivo.async('string');

  const { dia, mes, anio, diaNum, mesNum } = partesFecha(datos.fecha);
  const reemplazosX = [datos.nombre, datos.dni, datos.nombre, datos.dni, datos.nombre, datos.dni];
  let siguienteX = 0;
  const textos: string[] = [];
  xml.replace(NODO_TEXTO, (todo, _a: string, texto: string) => {
    textos.push(texto);
    return todo;
  });
  const posMes = textos.indexOf('Noviembre');
  if (posMes < 3 || textos[posMes - 3] !== '26' || textos[posMes + 2] !== '2026') {
    throw new Error('La plantilla de entrega cambió: no se encontró la fecha de la autorización');
  }
  // «FECHA:» viene partida en runs: 26 / 10 / 2026.
  const posFecha = textos.indexOf('FECHA:');
  if (posFecha < 0 || textos.slice(posFecha + 1, posFecha + 6).join('') !== '26/10/2026') {
    throw new Error('La plantilla de entrega cambió: no se encontró la fecha del encabezado');
  }

  xml = mapearTextos(xml, (texto, i) => {
    if (PLACEHOLDER.test(texto)) return reemplazosX[siguienteX++] ?? texto;
    if (i === posFecha + 1) return diaNum;
    if (i === posFecha + 3) return mesNum;
    if (i === posFecha + 5) return anio;
    if (i === posMes - 3) return dia;
    if (i === posMes) return mes;
    if (i === posMes + 2) return anio;
    return null;
  });
  if (siguienteX !== reemplazosX.length) throw new Error('La plantilla de entrega cambió: faltan datos por completar');

  xml = reemplazarFilas(xml, datos.filas);
  zip.file('word/document.xml', xml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** La plantilla trae dos filas de ejemplo (LAPTOP y Estuche): se sustituyen por los equipos reales. */
function reemplazarFilas(xml: string, filas: FilaEntrega[]): string {
  const filasXml = [...xml.matchAll(/<w:tr [^>]*>[\s\S]*?<\/w:tr>/g)].map((m) => m[0]);
  const ejemplo = filasXml.find((f) => f.includes('IDEA PAD'));
  const ejemplo2 = filasXml.find((f) => f.includes('Estuche'));
  if (!ejemplo || !ejemplo2) throw new Error('La plantilla de entrega cambió: no se encontraron las filas de ejemplo');

  const nuevas = filas.map((fila, i) => {
    const valores = [String(i + 1), fila.modelo, fila.marca, fila.serie, 'OK', fila.descripcion, String(fila.cantidad), fila.observaciones];
    let celda = 0;
    // Las celdas 1 a 8 son las del cuadro; la primera y las dos últimas son márgenes vacíos.
    return ejemplo.replace(/<w:tc>[\s\S]*?<\/w:tc>/g, (tc) => {
      const actual = celda++;
      return actual >= 1 && actual <= 8 ? cambiarPrimerTexto(tc, valores[actual - 1] ?? '') : tc;
    });
  });
  return xml.replace(ejemplo, () => nuevas.join('')).replace(ejemplo2, () => '');
}
