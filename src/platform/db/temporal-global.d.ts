declare namespace Temporal {
  class Instant {
    static from(isoString: string): Instant;
    readonly epochNanoseconds: bigint;
    readonly epochMilliseconds: number;
    toString(): string;
    toJSON(): string;
  }
  namespace Now {
    function instant(): Instant;
  }
}