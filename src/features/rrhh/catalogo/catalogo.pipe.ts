import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { CATALOGOS, type Catalogo } from './catalogo.dto.js';

/** Valida el segmento `:catalogo` de la URL (tipos-trabajador | modalidades-contrato). */
@Injectable()
export class ParseCatalogoPipe implements PipeTransform<string, Catalogo> {
  transform(valor: string): Catalogo {
    const catalogo = CATALOGOS.find((c) => c === valor);
    if (!catalogo) throw new BadRequestException(`Catálogo desconocido: use ${CATALOGOS.join(' o ')}`);
    return catalogo;
  }
}
