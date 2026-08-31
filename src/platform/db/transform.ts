import { Transform } from 'class-transformer';

export function toBoolean(): PropertyDecorator {
  return Transform(({ value }) =>
    value === undefined ? undefined : value === 'true' || value === true,
  );
}