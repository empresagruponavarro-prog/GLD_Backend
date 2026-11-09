import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { toVarchar } from '../../../platform/db/varchar-helpers.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import type { OpcionUbigeoDto, UbicacionDto } from './ubigeo.dto.js';
import { ubicacionDe } from './ubigeo.js';

const porNombre = (a: OpcionUbigeoDto, b: OpcionUbigeoDto) => a.nombre.localeCompare(b.nombre, 'es');

@Injectable()
export class UbigeoHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async departamentos(): Promise<OpcionUbigeoDto[]> {
    const filas = await this.db.orm.public.departamento.all();
    return filas.map((d) => ({ id: d.id, nombre: d.nombre })).sort(porNombre);
  }

  async provincias(idDepartamento: string): Promise<OpcionUbigeoDto[]> {
    const filas = await this.db.orm.public.provincia.where({ id_departamento: toVarchar<2>(idDepartamento) }).all();
    return filas.map((p) => ({ id: p.id, nombre: p.nombre })).sort(porNombre);
  }

  async distritos(idProvincia: string): Promise<OpcionUbigeoDto[]> {
    const filas = await this.db.orm.public.distrito.where({ id_provincia: toVarchar<4>(idProvincia) }).all();
    return filas.map((d) => ({ id: d.id, nombre: d.nombre })).sort(porNombre);
  }

  /** Ubicación completa de un código ubigeo de distrito (para completar las tres listas desde el código). */
  async ubicacion(idDistrito: string): Promise<UbicacionDto> {
    const u = await ubicacionDe(this.db.orm.public, idDistrito);
    if (!u) throw new NotFoundException(`No existe el ubigeo ${idDistrito}`);
    return u;
  }
}
