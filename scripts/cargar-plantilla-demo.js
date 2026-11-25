// Crea la plantilla corta de demostración "TPL-DEMO-01" (2 fases, 4 partidas, 8 ítems)
// reutilizando fases, partidas, productos y unidades existentes en el catálogo.
// NO toca las plantillas existentes.
//
//   node scripts/cargar-plantilla-demo.js            → simulación (revierte al terminar)
//   node scripts/cargar-plantilla-demo.js --aplicar  → aplica en una transacción
import 'dotenv/config';
import pg from 'pg';

const APLICAR = process.argv.includes('--aplicar');

const PLANTILLA = {
  id: 'TPL-DEMO-01',
  nombre: 'DEMO – IMPLEMENTACIÓN RÁPIDA TIENDA',
  descripcion:
    'Plantilla corta para demostración (2 fases, 4 partidas, 8 ítems) con costos referenciales y precios de venta.',
};

const FASES = [
  {
    idFase: 'TPLF-TPL-DEMO-01-01',
    idpptoFase: '9c249cf7', // IMPLEMENTACIÓN
    orden: 0,
    partidas: [
      {
        idpptoFaseCategoria: 'FC-424873-1', // OBRAS PRELIMINARES
        idCategoria: 10,
        costoReferencial: 1700.0,
        items: [
          {
            item: '1.01',
            idProducto: 12284,
            idUnidadMedida: 34, // mes
            cantidad: 1,
            costoUnitario: 1000.0,
            precioVenta: 1400.0,
            costoTotal: 1000.0,
            ventaTotal: 1400.0,
            orden: 0,
          },
          {
            item: '1.02',
            idProducto: 12285,
            idUnidadMedida: 31, // glb
            cantidad: 1,
            costoUnitario: 700.0,
            precioVenta: 950.0,
            costoTotal: 700.0,
            ventaTotal: 950.0,
            orden: 1,
          },
        ],
      },
      {
        idpptoFaseCategoria: 'FC-424924-3', // MURO DE DRYWALL /SUPERBOARD
        idCategoria: 4,
        costoReferencial: 2400.0,
        items: [
          {
            item: '2.01',
            idProducto: 12328,
            idUnidadMedida: 16, // m2
            cantidad: 20,
            costoUnitario: 60.0,
            precioVenta: 85.0,
            costoTotal: 1200.0,
            ventaTotal: 1700.0,
            orden: 0,
          },
          {
            item: '2.02',
            idProducto: 12329,
            idUnidadMedida: 17, // ml
            cantidad: 15,
            costoUnitario: 80.0,
            precioVenta: 115.0,
            costoTotal: 1200.0,
            ventaTotal: 1725.0,
            orden: 1,
          },
        ],
      },
    ],
  },
  {
    idFase: 'TPLF-TPL-DEMO-01-02',
    idpptoFase: 'b8713cc6', // OBRA GRUESA
    orden: 1,
    partidas: [
      {
        idpptoFaseCategoria: 'FC-425084-32', // OBRAS PRELIMINARES
        idCategoria: 10,
        costoReferencial: 400.0,
        items: [
          {
            item: '1.01',
            idProducto: 12618,
            idUnidadMedida: 17, // ml
            cantidad: 15,
            costoUnitario: 16.0,
            precioVenta: 24.0,
            costoTotal: 240.0,
            ventaTotal: 360.0,
            orden: 0,
          },
          {
            item: '1.02',
            idProducto: 12620,
            idUnidadMedida: 33, // m3
            cantidad: 4,
            costoUnitario: 40.0,
            precioVenta: 60.0,
            costoTotal: 160.0,
            ventaTotal: 240.0,
            orden: 1,
          },
        ],
      },
      {
        idpptoFaseCategoria: 'FC-OC-451570', // OBRAS CIVILES
        idCategoria: 10,
        costoReferencial: 1200.0,
        items: [
          {
            item: '2.01',
            idProducto: 12627,
            idUnidadMedida: 33, // m3
            cantidad: 5,
            costoUnitario: 180.0,
            precioVenta: 270.0,
            costoTotal: 900.0,
            ventaTotal: 1350.0,
            orden: 0,
          },
          {
            item: '2.02',
            idProducto: 12628,
            idUnidadMedida: 16, // m2
            cantidad: 10,
            costoUnitario: 30.0,
            precioVenta: 45.0,
            costoTotal: 300.0,
            ventaTotal: 450.0,
            orden: 1,
          },
        ],
      },
    ],
  },
];

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

const q = async (sql, params = []) => (await db.query(sql, params)).rows;

await db.query('BEGIN');
try {
  const existente = await q('select id from "ppto_Plantillas" where "IdPlantilla" = $1', [PLANTILLA.id]);
  if (existente.length) {
    throw new Error(`La plantilla ${PLANTILLA.id} ya existe (id=${existente[0].id}).`);
  }

  await db.query(
    'insert into "ppto_Plantillas" ("IdPlantilla", "Nombre", "Descripcion", "Activo", "FechaCreacion") values ($1, $2, $3, true, now())',
    [PLANTILLA.id, PLANTILLA.nombre, PLANTILLA.descripcion],
  );

  for (const fase of FASES) {
    await db.query(
      'insert into "ppto_Plantillas_Fases" ("IdPlantillaFase", "IdPlantilla", "IdpptoFase", "Orden") values ($1, $2, $3, $4)',
      [fase.idFase, PLANTILLA.id, fase.idpptoFase, fase.orden],
    );

    for (const part of fase.partidas) {
      const [{ id: idPlantillaCategoria }] = await q(
        'insert into "ppto_Plantillas_Categorias" ("IdPlantillaFase", "IdpptoFaseCategoria", id_categoria, "CostoReferencial") values ($1, $2, $3, $4) returning id',
        [fase.idFase, part.idpptoFaseCategoria, part.idCategoria, part.costoReferencial],
      );

      for (const it of part.items) {
        await db.query(
          'insert into "ppto_Plantillas_Items" (id_plantilla_categoria, id_producto, id_unidad_medida, "Item", "Cantidad", "CostoUnitario", "PrecioVenta", "CostoTotal", "VentaTotal", "Orden") values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
          [
            idPlantillaCategoria,
            it.idProducto,
            it.idUnidadMedida,
            it.item,
            it.cantidad,
            it.costoUnitario,
            it.precioVenta,
            it.costoTotal,
            it.ventaTotal,
            it.orden,
          ],
        );
      }
    }
  }

  const resumen = await q(
    `select f."Orden", mf."FaseProyecto", count(distinct c.id)::int as partidas, count(i.id)::int as items,
            coalesce(sum(i."CostoTotal"), 0)::numeric(12,2) as costo_total,
            coalesce(sum(i."VentaTotal"), 0)::numeric(12,2) as venta_total
       from "ppto_Plantillas_Fases" f
       join "ppto_Fases" mf on mf."IdpptoFase" = f."IdpptoFase"
       left join "ppto_Plantillas_Categorias" c on c."IdPlantillaFase" = f."IdPlantillaFase"
       left join "ppto_Plantillas_Items" i on i.id_plantilla_categoria = c.id
      where f."IdPlantilla" = $1
      group by f."Orden", mf."FaseProyecto"
      order by f."Orden"`,
    [PLANTILLA.id],
  );
  console.table(resumen);

  const [{ costo_total, venta_total }] = await q(
    `select coalesce(sum(i."CostoTotal"), 0)::numeric(12,2) as costo_total,
            coalesce(sum(i."VentaTotal"), 0)::numeric(12,2) as venta_total
       from "ppto_Plantillas_Fases" f
       join "ppto_Plantillas_Categorias" c on c."IdPlantillaFase" = f."IdPlantillaFase"
       join "ppto_Plantillas_Items" i on i.id_plantilla_categoria = c.id
      where f."IdPlantilla" = $1`,
    [PLANTILLA.id],
  );
  console.log(`Totales ${PLANTILLA.id}: CostoTotal=${costo_total}, VentaTotal=${venta_total}`);

  if (APLICAR) {
    await db.query('COMMIT');
    console.log('APLICADO.');
  } else {
    await db.query('ROLLBACK');
    console.log('SIMULACIÓN: se revirtió todo. Agrega --aplicar para cargar.');
  }
} catch (err) {
  await db.query('ROLLBACK').catch(() => {});
  console.error('ERROR:', err.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
