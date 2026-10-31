import type { Database } from '../../../../prisma/prisma.module.js';

/** ORM del esquema `public`: lo que ofrecen tanto `db.orm.public` como `tx.orm.public`. */
export type OrmObra = Database['orm']['public'];

/** Contexto de transacción que entrega `db.transaction(...)`. */
export type TxObra = Parameters<Parameters<Database['transaction']>[0]>[0];
