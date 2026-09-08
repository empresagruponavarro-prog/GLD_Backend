const globalWithTemporal = globalThis as typeof globalThis & {
  Temporal?: {
    Instant: {
      new (epochMilliseconds: number): Temporal.Instant;
      from(isoString: string): Temporal.Instant;
    };
    Now: { instant(): Temporal.Instant };
  };
};

if (!globalWithTemporal.Temporal) {
  class TemporalInstant {
    readonly epochMilliseconds: number;

    constructor(epochMilliseconds: number) {
      this.epochMilliseconds = epochMilliseconds;
    }

    static from(isoString: string): TemporalInstant {
      const parsed = Date.parse(isoString);
      if (Number.isNaN(parsed)) {
        throw new RangeError(`Invalid Temporal instant: ${isoString}`);
      }

      return new TemporalInstant(parsed);
    }

    get epochNanoseconds(): bigint {
      return BigInt(this.epochMilliseconds) * 1000000n;
    }

    toString(): string {
      return new Date(this.epochMilliseconds).toISOString();
    }

    toJSON(): string {
      return this.toString();
    }

    toISOString(): string {
      return this.toString();
    }
  }

  globalWithTemporal.Temporal = {
    Instant: TemporalInstant as any,
    Now: {
      instant: () => new TemporalInstant(Date.now()) as Temporal.Instant,
    },
  };
}

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