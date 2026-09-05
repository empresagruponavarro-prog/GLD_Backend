import { ConflictException } from '@nestjs/common';

export function pgErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const { code, cause } = error as { code?: unknown; cause?: unknown };
  if (typeof code === 'string') return code;
  return pgErrorCode(cause);
}

export function throwIfUniqueViolation(error: unknown, message: string): void {
  if (pgErrorCode(error) === '23505') throw new ConflictException(message);
}

export function throwIfForeignKeyViolation(error: unknown, message: string): void {
  if (pgErrorCode(error) === '23503') throw new ConflictException(message);
}