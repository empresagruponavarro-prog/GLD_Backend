import { Module } from '@nestjs/common';
import { db } from './db.js';

export const DB = Symbol('DB');

export type Database = typeof db;

@Module({
  providers: [{ provide: DB, useValue: db }],
  exports: [DB],
})
export class PrismaModule {}