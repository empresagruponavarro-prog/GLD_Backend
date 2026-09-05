export function toInstant(value?: string | null): Temporal.Instant | null {
  if (!value) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
  return Temporal.Instant.from(iso);
}

export function nowInstant(): Temporal.Instant {
  return Temporal.Instant.from(new Date().toISOString());
}

export function toInstantString(value?: unknown): string {
  if (!value) return '';
  const v = value as { toJSON?(): string; toISOString?(): string; toString?(): string };
  return v.toJSON?.() ?? v.toISOString?.() ?? v.toString?.() ?? String(value);
}