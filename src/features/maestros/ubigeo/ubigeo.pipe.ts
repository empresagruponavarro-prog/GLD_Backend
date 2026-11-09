import { BadRequestException, type PipeTransform } from '@nestjs/common';

const PATRONES = { 2: /^\d{2}$/, 4: /^\d{4}$/, 6: /^\d{6}$/ } as const;

/** Valida un código ubigeo de `digitos` cifras (2 departamento, 4 provincia, 6 distrito). */
export class ParseCodigoUbigeoPipe implements PipeTransform<unknown, string> {
  constructor(private readonly digitos: 2 | 4 | 6) {}

  transform(valor: unknown): string {
    const v = typeof valor === 'string' ? valor.trim() : '';
    if (!PATRONES[this.digitos].test(v)) throw new BadRequestException(`El código ubigeo debe tener ${this.digitos} dígitos`);
    return v;
  }
}
