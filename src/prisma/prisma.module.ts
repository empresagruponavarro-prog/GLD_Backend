import { Module, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { db } from './db.js';

export const DB = Symbol('DB');

export type Database = typeof db;

@Module({
  providers: [{ provide: DB, useValue: db }],
  exports: [DB],
})
export class PrismaModule implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await db.connect();
  }

  async onModuleDestroy() {
    await db.close();
  }
}