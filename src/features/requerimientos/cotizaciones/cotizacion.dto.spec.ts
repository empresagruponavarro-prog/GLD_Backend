import { PORCENTAJE_REGEX } from './cotizacion.dto.js';

describe('PORCENTAJE_REGEX (adelanto de una cotización)', () => {
  it.each(['0', '5', '15', '12.5', '99.9999', '100', '100.0', '100.0000'])('acepta %s', (v) => {
    expect(PORCENTAJE_REGEX.test(v)).toBe(true);
  });

  it.each(['', '-1', '100.01', '101', '150', '1500', '15.', '.5', '12.55555', '1e2', 'abc', ' 15'])('rechaza «%s»', (v) => {
    expect(PORCENTAJE_REGEX.test(v)).toBe(false);
  });
});
