import type { Varchar } from '@prisma/orm-postgres/target/codec-types';

export type Varchar255 = Varchar<255>;
export type Varchar50 = Varchar<50>;

export function toVarchar<L extends number = 255>(value: string): Varchar<L>;
export function toVarchar<L extends number = 255>(value: string | undefined): Varchar<L> | undefined;
export function toVarchar<L extends number = 255>(value: string | null | undefined): Varchar<L> | null | undefined;
export function toVarchar<L extends number = 255>(value: string | null | undefined): Varchar<L> | null | undefined {
  return value as unknown as Varchar<L>;
}

export function toDecimalString(value: number | string | undefined | null): string | undefined {
  if (value === undefined || value === null) return undefined;
  return typeof value === 'number' ? value.toFixed(2) : String(value);
}
