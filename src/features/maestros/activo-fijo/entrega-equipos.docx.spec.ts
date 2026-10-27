import JSZip from 'jszip';
import { generarEntregaDocx } from './entrega-equipos.docx.js';

async function textosDe(buffer: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml')!.async('string');
  return [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1] ?? '');
}

const FILA = {
  modelo: 'ThinkPad',
  marca: 'LENOVO',
  serie: 'SN-123',
  descripcion: 'LAPTOP + CARGADOR',
  cantidad: 1,
  observaciones: 'NUEVO',
};

describe('generarEntregaDocx', () => {
  it('rellena quien recibe, las fechas y los equipos, y quita las filas de ejemplo', async () => {
    const buffer = await generarEntregaDocx({
      nombre: 'Juan Pérez & Cía',
      dni: '12345678',
      fecha: '2027-03-05',
      filas: [FILA, { ...FILA, modelo: 'Mouse', serie: 'SN-456' }],
    });
    const textos = await textosDe(buffer);
    const texto = textos.join('|');

    expect(textos.filter((t) => t === 'Juan Pérez &amp; Cía')).toHaveLength(3); // el XML guarda «&» escapado
    expect(textos.filter((t) => t === '12345678')).toHaveLength(3);
    expect(textos).not.toContain('IDEA PAD');
    expect(textos).not.toContain('Estuche');
    expect(textos).toContain('ThinkPad');
    expect(textos).toContain('Mouse');
    // Encabezado 05/03/2027 y autorización «a partir del día 5 de Marzo del 2027».
    expect(texto).toContain('FECHA:|05|/|03|/|2027');
    expect(texto).toContain('5| |de |Marzo| del |2027');
    expect(texto).not.toContain('Noviembre');
    expect(texto).not.toContain('(Nombre):');
    expect(texto).toContain('Digital|Juan Pérez &amp; Cía|DNI N° |12345678');
  });

  it('con una sola fila no deja filas de ejemplo', async () => {
    const textos = await textosDe(await generarEntregaDocx({ nombre: 'Ana', dni: '1', fecha: '2026-12-31', filas: [FILA] }));
    expect(textos).toContain('ThinkPad');
    expect(textos).not.toContain('Estuche');
    expect(textos).toContain('Diciembre');
  });
});
