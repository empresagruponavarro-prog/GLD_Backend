import {
  agruparDeseados,
  claseDe,
  claveGrupo,
  firmaGrupo,
  planConciliacion,
  type CabeceraFirma,
  type GrupoExistente,
  type ItemDeseado,
} from './plan-conciliacion.js';

const cabecera = (over: Partial<CabeceraFirma> = {}): CabeceraFirma => ({
  idProveedor: 1,
  fecha: '2026-11-17',
  referencia: null,
  monedaId: 'PEN',
  monedaSimbolo: 'S/',
  incluyeIgv: false,
  afectoIgv: true,
  formaPago: 'CONTADO',
  diasCredito: 0,
  adelantoPorcentaje: null,
  medioPago: null,
  plazoEntregaDias: null,
  validezDias: null,
  garantia: null,
  condiciones: null,
  archivoUrl: null,
  ...over,
});

const item = (idItem: number, over: Partial<ItemDeseado> = {}): ItemDeseado => ({
  idItem,
  idDetalleFase: 10,
  idFaseMaestra: 100,
  idProveedor: 1,
  idCotizacion: 500,
  idSubfase: 7,
  idProducto: 1000 + idItem,
  tipoProducto: 'PRODUCTO',
  cantidad: '10',
  precioMeta: '5',
  precioCotizado: '4.5',
  plazoEntregaDias: null,
  marcaModelo: null,
  observaciones: null,
  ...over,
});

/** Firma como la arma el ejecutor: la cabecera de la cotización + las líneas del grupo. */
const grupos = (items: ItemDeseado[], cab: CabeceraFirma = cabecera()) => agruparDeseados(items, (_c, ls) => firmaGrupo(cab, ls));
const existente = (g: { clave: string; firma: string }, idRequerimiento: number): GrupoExistente => ({ clave: g.clave, firma: g.firma, idRequerimiento });

describe('compromisos / plan de conciliación', () => {
  it('bienes van a orden de compra y servicios a orden de servicio', () => {
    expect(claseDe('PRODUCTO')).toBe('ORDEN_COMPRA');
    expect(claseDe('SERVICIO')).toBe('ORDEN_SERVICIO');
  });

  it('agrupa por fase y proveedor: un FUR por cada par', () => {
    const g = grupos([item(1), item(2), item(3, { idProveedor: 2, idCotizacion: 501 }), item(4, { idFaseMaestra: 200, idDetalleFase: 20, idCotizacion: 502 })]);
    expect(g.map((x) => x.clave).sort()).toEqual(['100|1', '100|2', '200|1']);
    expect(g.find((x) => x.clave === '100|1')!.items.map((i) => i.idItem)).toEqual([1, 2]);
  });

  it('una fase fuera del catálogo se identifica por su fase del presupuesto', () => {
    expect(claveGrupo(null, 1, 10)).toBe('d10|1');
    expect(claveGrupo(100, 1, 10)).toBe('100|1');
  });

  it('sin nada existente: se crea todo', () => {
    const d = grupos([item(1), item(2, { idProveedor: 2 })]);
    const plan = planConciliacion(d, []);
    expect(plan.crear).toHaveLength(2);
    expect(plan.actualizar).toEqual([]);
    expect(plan.anular).toEqual([]);
  });

  it('dos conciliaciones seguidas sin cambios no hacen nada (idempotente)', () => {
    const d = grupos([item(1), item(2)]);
    const plan = planConciliacion(d, [existente(d[0], 77)]);
    expect(plan).toEqual({ crear: [], actualizar: [], anular: [], sinCambio: 1 });
  });

  it.each([
    ['cambia la cantidad del ítem', [item(1, { cantidad: '12' }), item(2)]],
    ['cambia el precio cotizado', [item(1, { precioCotizado: '4' }), item(2)]],
    ['cambia el precio del Meta', [item(1, { precioMeta: '6' }), item(2)]],
    ['cambia el producto', [item(1, { idProducto: 5 }), item(2)]],
    ['entra un ítem al grupo', [item(1), item(2), item(3)]],
    ['sale un ítem del grupo', [item(1)]],
  ])('actualiza si %s', (_t, nuevos) => {
    const antes = grupos([item(1), item(2)]);
    const plan = planConciliacion(grupos(nuevos), [existente(antes[0], 77)]);
    expect(plan.actualizar).toHaveLength(1);
    expect(plan.actualizar[0].existente.idRequerimiento).toBe(77);
    expect(plan.crear).toEqual([]);
    expect(plan.anular).toEqual([]);
  });

  it('actualiza si cambian las condiciones de la cotización (forma de pago, crédito, adelanto, IGV…)', () => {
    const antes = grupos([item(1)]);
    for (const over of [{ formaPago: 'CREDITO 30' }, { diasCredito: 30 }, { adelantoPorcentaje: '30' }, { incluyeIgv: true }, { garantia: '1 AÑO' }, { monedaId: 'USD' }]) {
      const plan = planConciliacion(grupos([item(1)], cabecera(over)), [existente(antes[0], 77)]);
      expect(plan.actualizar).toHaveLength(1);
    }
  });

  it('la huella ignora diferencias de formato numérico (10 = 10.00) y espacios', () => {
    const a = grupos([item(1, { cantidad: '10' })], cabecera({ garantia: ' 1 AÑO ' }));
    const b = grupos([item(1, { cantidad: '10.0000' })], cabecera({ garantia: '1 AÑO' }));
    expect(planConciliacion(b, [existente(a[0], 1)]).sinCambio).toBe(1);
  });

  it('cambiar el ganador de un ítem a otro proveedor: el grupo viejo se actualiza y el del nuevo se crea', () => {
    const antes = grupos([item(1), item(2)]);
    const despues = grupos([item(1), item(2, { idProveedor: 2, idCotizacion: 501 })]);
    const plan = planConciliacion(despues, [existente(antes[0], 77)]);
    expect(plan.actualizar.map((a) => a.existente.idRequerimiento)).toEqual([77]);
    expect(plan.crear.map((g) => g.clave)).toEqual(['100|2']);
  });

  it('un grupo que se queda sin ítems se anula', () => {
    const antes = grupos([item(1), item(2, { idProveedor: 2, idCotizacion: 501 })]);
    const plan = planConciliacion(grupos([item(1)]), [existente(antes[0], 77), existente(antes[1], 78)]);
    expect(plan.anular.map((g) => g.idRequerimiento)).toEqual([78]);
    expect(plan.sinCambio).toBe(1);
  });

  it('sin ítems adjudicados se anula todo lo provisional', () => {
    const antes = grupos([item(1)]);
    expect(planConciliacion([], [existente(antes[0], 77)]).anular).toHaveLength(1);
  });

  it('dos FUR con la misma clave (datos corruptos): se conserva el más antiguo y se anula el otro', () => {
    const d = grupos([item(1)]);
    const plan = planConciliacion(d, [existente(d[0], 90), existente(d[0], 80)]);
    expect(plan.sinCambio).toBe(1);
    expect(plan.anular.map((g) => g.idRequerimiento)).toEqual([90]);
  });
});
