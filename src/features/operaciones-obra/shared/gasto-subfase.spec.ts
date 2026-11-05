import { calcularGastoSubfase, type LineaCompra, type SalidaConsumo } from './gasto-subfase.js';

const metas = [
  { id: 10, nombre: 'Muros', meta: 1000 },
  { id: 20, nombre: 'Pisos', meta: 500 },
];
const servicio = (subfase: number | null, monto: number): LineaCompra => ({ subfase, esServicio: true, monto });
const bien = (subfase: number | null, monto: number): LineaCompra => ({ subfase, esServicio: false, monto });
const salida = (subfase: number | null, costo: number): SalidaConsumo => ({ subfase, costo });

const de = (r: ReturnType<typeof calcularGastoSubfase>, id: number | null) => r.subfases.find((s) => s.id_ppto_detalle_categoria === id)!;

describe('operaciones-obra / calcularGastoSubfase (directo, indirecto y compromiso sin doble conteo)', () => {
  it('el servicio es gasto directo y el bien comprado sin salir es compromiso', () => {
    const r = calcularGastoSubfase(1, metas, [servicio(10, 200), bien(10, 300)], []);

    expect(de(r, 10)).toMatchObject({ directo: 200, indirecto: 0, compromiso: 300, ejecutado: 200, proyectado: 500, meta: 1000, saldo: 500, sobre_meta: false });
  });

  it('lo que ya salió por PECOSA pasa de compromiso a indirecto (no se cuenta dos veces)', () => {
    const r = calcularGastoSubfase(1, metas, [bien(10, 300)], [salida(10, 120)]);

    expect(de(r, 10)).toMatchObject({ indirecto: 120, compromiso: 180, ejecutado: 120, proyectado: 300 });
  });

  it('si salió más de lo comprado en OC (stock previo) el compromiso queda en 0, no negativo', () => {
    const r = calcularGastoSubfase(1, metas, [bien(10, 100)], [salida(10, 250)]);

    expect(de(r, 10)).toMatchObject({ indirecto: 250, compromiso: 0, proyectado: 250 });
  });

  it('marca sobre_meta y deja el saldo negativo cuando el proyectado supera la meta', () => {
    const r = calcularGastoSubfase(1, metas, [servicio(20, 450)], [salida(20, 100)]);

    expect(de(r, 20)).toMatchObject({ proyectado: 550, saldo: -50, sobre_meta: true });
  });

  it('lo no imputado va a «Sin subfase», al final y sin meta', () => {
    const r = calcularGastoSubfase(1, metas, [servicio(null, 80)], [salida(null, 20)]);
    const ultima = r.subfases[r.subfases.length - 1];

    expect(ultima).toMatchObject({ id_ppto_detalle_categoria: null, subfase: 'Sin subfase', meta: null, saldo: null, directo: 80, indirecto: 20 });
    expect(ultima.sobre_meta).toBe(false);
  });

  it('una subfase con gasto pero sin meta (otra estructura) aparece con su nombre y sin saldo', () => {
    const r = calcularGastoSubfase(1, metas, [servicio(99, 40)], [], new Map([[99, 'Adicional']]));

    expect(de(r, 99)).toMatchObject({ subfase: 'Adicional', meta: null, saldo: null, directo: 40 });
  });

  it('las subfases con meta salen aunque no tengan gasto, en el orden de las metas', () => {
    const r = calcularGastoSubfase(1, metas, [], []);

    expect(r.subfases.map((s) => s.subfase)).toEqual(['Muros', 'Pisos']);
    expect(de(r, 10)).toMatchObject({ directo: 0, indirecto: 0, compromiso: 0, proyectado: 0, saldo: 1000 });
  });

  it('los totales suman las subfases y el saldo total es meta − proyectado', () => {
    const r = calcularGastoSubfase(1, metas, [servicio(10, 200), bien(20, 100), servicio(null, 50)], [salida(20, 40)]);

    expect(r.total).toEqual({ meta: 1500, directo: 250, indirecto: 40, compromiso: 60, ejecutado: 290, proyectado: 350, saldo: 1150 });
  });

  it('redondea a 2 decimales y conserva el conteo de líneas sin tipo de cambio', () => {
    const r = calcularGastoSubfase(1, metas, [servicio(10, 0.1), servicio(10, 0.2)], [], new Map(), 3);

    expect(de(r, 10).directo).toBe(0.3);
    expect(r.lineas_sin_tipo_cambio).toBe(3);
  });
});
