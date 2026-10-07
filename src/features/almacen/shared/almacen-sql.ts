import { Inject, Injectable } from '@nestjs/common';
import { DB, type Database } from '../../../prisma/prisma.module.js';

/** Contexto de transaccion que entrega `db.transaction(...)`. */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Columna `text` no nula (todo numeric/date se castea a text en el SQL). */
export const T = { codecId: 'pg/text@1', nullable: false } as const;
/** Columna `text` nula. */
export const TN = { codecId: 'pg/text@1', nullable: true } as const;
/** Columna `int4` no nula. */
export const I = { codecId: 'pg/int4@1', nullable: false } as const;
/** Columna `int4` nula. */
export const IN = { codecId: 'pg/int4@1', nullable: true } as const;
/** Columna `bool` no nula. */
export const B = { codecId: 'pg/bool@1', nullable: false } as const;

type RowSpec = Record<string, { readonly codecId: string; readonly nullable: boolean }>;
type RawBuilder = {
  returnsRow(spec: RowSpec): { build(): unknown };
  affectedCount(): { build(): unknown };
};
type RawTag = (strings: TemplateStringsArray, ...values: unknown[]) => RawBuilder;
type Executor = {
  query(plan: unknown): { toArray(): Promise<unknown[]> };
  execute(plan: unknown): Promise<{ affectedRows: number }>;
};

/**
 * Acceso a SQL crudo tipado por columnas. El control de almacen usa SQL
 * explicito porque las cantidades/costos son `numeric` (se operan en la BD,
 * nunca como `number`) y las lecturas requieren joins.
 */
@Injectable()
export class AlmacenSql {
  constructor(@Inject(DB) private readonly db: Database) {}

  private get tag(): RawTag {
    return this.db.raw.sql as unknown as RawTag;
  }

  /** SELECT / `... RETURNING` dentro de una transaccion o fuera de ella. */
  async rows<R extends object>(
    spec: RowSpec,
    strings: TemplateStringsArray,
    values: unknown[],
    tx?: Tx,
  ): Promise<R[]> {
    const plan = this.tag(strings, ...values).returnsRow(spec).build();
    const executor = (tx ?? this.db.runtime()) as unknown as Executor;
    return (await executor.query(plan).toArray()) as R[];
  }

  /** INSERT / UPDATE / DELETE sin retorno; devuelve las filas afectadas. */
  async run(tx: Tx, strings: TemplateStringsArray, values: unknown[]): Promise<number> {
    const plan = this.tag(strings, ...values).affectedCount().build();
    const res = await (tx as unknown as Executor).execute(plan);
    return res.affectedRows;
  }
}

/** Atajo para tagged templates: `q(spec)\`SELECT ...\`` -> (tx?) => rows. */
export function sqlTag(sql: AlmacenSql) {
  return {
    rows:
      <R extends object>(spec: RowSpec, tx?: Tx) =>
      (strings: TemplateStringsArray, ...values: unknown[]) =>
        sql.rows<R>(spec, strings, values, tx),
    run:
      (tx: Tx) =>
      (strings: TemplateStringsArray, ...values: unknown[]) =>
        sql.run(tx, strings, values),
  };
}
