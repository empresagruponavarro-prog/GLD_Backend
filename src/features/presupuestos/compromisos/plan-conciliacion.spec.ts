import {
  agruparDeseados,
  claseDe,
  claveCondiciones,
  claveGrupo,
  fusionarCabeceras,
  normalizarIgv,
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
  incluyeIgv: false,
  plazoEntregaDias: null,
  marcaModelo: null,
  observaciones: null,
  ...over,
});

/** Firma como la arma el ejecutor: la cabecera de la cotización + las líneas del grupo. */
const grupos = (items: ItemDeseado[], cab: CabeceraFirma = cabecera()) => agruparDeseados(items, () => cab);
const existente = (g: { clave: string; base: string; firma: string }, idRequerimiento: number): GrupoExistente => ({ clave: g.clave, base: g.base, firma: g.firma, idRequerimiento });

describe('compromisos / plan de conciliación', () => {
  it('bienes van a orden de compra y servicios a orden de servicio', () => {
    expect(claseDe('PRODUCTO')).toBe('ORDEN_COMPRA');
    expect(claseDe('SERVICIO')).toBe('ORDEN_SERVICIO');
  });

  it('agrupa por fase y proveedor: un FUR por cada par', () => {
    const g = grupos([item(1), item(2), item(3, { idProveedor: 2, idCotizacion: 501 }), item(4, { idFaseMaestra: 200, idDetalleFase: 20, idCotizacion: 502 })]);
    expect(g.map((x) => x.base).sort()).toEqual(['100|1', '100|2', '200|1']);
    expect(g.find((x) => x.base === '100|1')!.items.map((i) => i.idItem)).toEqual([1, 2]);
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
    expect(plan.crear.map((g) => g.base)).toEqual(['100|2']);
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

  describe('C-1 · una orden por (fase, proveedor, condiciones)', () => {
    const cabDe = (por: Record<number, Partial<CabeceraFirma>>) => (idCot: number) => cabecera(por[idCot] ?? {});

    it('el mismo proveedor con adelanto distinto en dos subpartidas de la fase son dos grupos, cada uno con el suyo', () => {
      const g = agruparDeseados([item(1, { idCotizacion: 500 }), item(2, { idCotizacion: 501 })], cabDe({ 500: { adelantoPorcentaje: '15' }, 501: { adelantoPorcentaje: '20' } }));
      expect(g).toHaveLength(2);
      expect(g.map((x) => x.cabecera.adelantoPorcentaje).sort()).toEqual(['15', '20']);
      expect(new Set(g.map((x) => x.base)).size).toBe(1);
      expect(g.every((x) => x.items.length === 1)).toBe(true);
    });

    it('con las mismas condiciones, varias cotizaciones forman un solo grupo y su cabecera las funde', () => {
      const g = agruparDeseados(
        [item(1, { idCotizacion: 500 }), item(2, { idCotizacion: 501 })],
        cabDe({ 500: { garantia: '6 MESES', plazoEntregaDias: 10, referencia: 'A-1' }, 501: { garantia: '1 AÑO', plazoEntregaDias: 20, validezDias: 15, referencia: 'A-2' } }),
      );
      expect(g).toHaveLength(1);
      expect(g[0].idsCotizacion).toEqual([500, 501]);
      expect(g[0].cabecera).toMatchObject({ garantia: '6 MESES / 1 AÑO', plazoEntregaDias: 20, validezDias: 15, referencia: 'A-1 / A-2' });
    });

    it('la forma de pago no distingue mayúsculas y «incluye IGV» no separa grupos', () => {
      expect(claveCondiciones(cabecera({ formaPago: 'Contado' }))).toBe(claveCondiciones(cabecera({ formaPago: ' CONTADO ' })));
      expect(claveCondiciones(cabecera({ incluyeIgv: true }))).toBe(claveCondiciones(cabecera({ incluyeIgv: false })));
      for (const over of [{ monedaId: 'USD' }, { afectoIgv: false }, { diasCredito: 30 }, { adelantoPorcentaje: '10' }, { formaPago: 'Credito' }]) {
        expect(claveCondiciones(cabecera(over))).not.toBe(claveCondiciones(cabecera()));
      }
    });

    it('si las ofertas mezclan IGV incluido y no incluido, cada precio se pasa a sin IGV y el grupo queda sin IGV incluido', () => {
      const g = agruparDeseados(
        [item(1, { idCotizacion: 500, precioCotizado: '118', incluyeIgv: true }), item(2, { idCotizacion: 501, precioCotizado: '50', incluyeIgv: false })],
        cabDe({ 500: { incluyeIgv: true }, 501: { incluyeIgv: false } }),
      );
      expect(g).toHaveLength(1);
      expect(g[0].cabecera.incluyeIgv).toBe(false);
      expect(g[0].items.map((i) => i.precioCotizado)).toEqual(['100.0000', '50']);
      expect(g[0].items.every((i) => !i.incluyeIgv)).toBe(true);
    });

    it('si todas son iguales no se toca ningún precio; un proveedor no afecto al IGV no divide', () => {
      const todas = [item(1, { precioCotizado: '118', incluyeIgv: true }), item(2, { precioCotizado: '59', incluyeIgv: true })];
      expect(normalizarIgv(todas, true).map((i) => i.precioCotizado)).toEqual(['118', '59']);
      const mezcla = [item(1, { precioCotizado: '118', incluyeIgv: true }), item(2, { precioCotizado: '50', incluyeIgv: false })];
      expect(normalizarIgv(mezcla, false).map((i) => i.precioCotizado)).toEqual(['118', '50']);
    });

    it('fusionar una sola cabecera la devuelve igual', () => {
      const c = cabecera({ garantia: '1 AÑO' });
      expect(fusionarCabeceras([c])).toBe(c);
    });

    it('cambiar las condiciones de la única cotización de un FUR lo actualiza: conserva su número y sus órdenes', () => {
      const antes = grupos([item(1)], cabecera());
      const plan = planConciliacion(grupos([item(1)], cabecera({ adelantoPorcentaje: '20' })), [existente(antes[0], 77)]);
      expect(plan.crear).toEqual([]);
      expect(plan.anular).toEqual([]);
      expect(plan.actualizar.map((a) => a.existente.idRequerimiento)).toEqual([77]);
    });

    it('una segunda subpartida con otras condiciones crea su propio FUR y no toca el que ya existe', () => {
      const antes = grupos([item(1, { idCotizacion: 500 })], cabecera());
      const despues = agruparDeseados([item(1, { idCotizacion: 500 }), item(2, { idCotizacion: 501 })], cabDe({ 501: { adelantoPorcentaje: '20' } }));
      const plan = planConciliacion(despues, [existente(antes[0], 77)]);
      expect(plan.sinCambio).toBe(1);
      expect(plan.crear).toHaveLength(1);
      expect(plan.crear[0].cabecera.adelantoPorcentaje).toBe('20');
      expect(plan.actualizar).toEqual([]);
      expect(plan.anular).toEqual([]);
    });

    it('si el grupo que cambió de condiciones se une a otro existente, el que sobra se anula (no se adivina)', () => {
      const a = grupos([item(1, { idCotizacion: 500 })], cabecera());
      const b = grupos([item(2, { idCotizacion: 501 })], cabecera({ adelantoPorcentaje: '20' }));
      // Ahora las dos cotizaciones tienen las condiciones de la segunda: un solo grupo deseado, dos FUR existentes de la misma base.
      const unidos = agruparDeseados([item(1, { idCotizacion: 500 }), item(2, { idCotizacion: 501 })], () => cabecera({ adelantoPorcentaje: '20' }));
      const plan = planConciliacion(unidos, [existente(a[0], 77), existente(b[0], 78)]);
      expect(plan.actualizar.map((x) => x.existente.idRequerimiento)).toEqual([78]); // coincide la clave exacta
      expect(plan.anular.map((x) => x.idRequerimiento)).toEqual([77]);
      expect(plan.crear).toEqual([]);
    });

    it('con varios deseados y varios existentes de la misma base sin clave exacta, no se adivina: se crea y se anula', () => {
      const a = grupos([item(1, { idCotizacion: 500 })], cabecera({ diasCredito: 7 }));
      const b = grupos([item(2, { idCotizacion: 501 })], cabecera({ diasCredito: 15 }));
      const nuevos = agruparDeseados([item(1, { idCotizacion: 500 }), item(2, { idCotizacion: 501 })], cabDe({ 500: { diasCredito: 30 }, 501: { diasCredito: 60 } }));
      const plan = planConciliacion(nuevos, [existente(a[0], 77), existente(b[0], 78)]);
      expect(plan.crear).toHaveLength(2);
      expect(plan.anular.map((x) => x.idRequerimiento).sort()).toEqual([77, 78]);
      expect(plan.actualizar).toEqual([]);
    });
  });

  it('dos FUR con la misma clave (datos corruptos): se conserva el más antiguo y se anula el otro', () => {
    const d = grupos([item(1)]);
    const plan = planConciliacion(d, [existente(d[0], 90), existente(d[0], 80)]);
    expect(plan.sinCambio).toBe(1);
    expect(plan.anular.map((g) => g.idRequerimiento)).toEqual([90]);
  });
});
