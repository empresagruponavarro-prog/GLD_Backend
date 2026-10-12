import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AlmacenSql, B, I, IN, T, TN, sqlTag } from '../../almacen/shared/almacen-sql.js';
import { CreateCuentaDto, CuentaResponseDto, UpdateCuentaDto } from '../tesoreria.dto.js';

const SPEC = {
  id: I,
  codigo: T,
  nombre: T,
  tipo: T,
  banco: TN,
  numero_cuenta: TN,
  cci: TN,
  moneda_id: T,
  id_empresa: IN,
  estado: B,
} as const;

@Injectable()
export class CuentasHandler {
  constructor(private readonly sql: AlmacenSql) {}

  async list(soloActivas = false): Promise<CuentaResponseDto[]> {
    const q = sqlTag(this.sql);
    return q.rows<CuentaResponseDto>(SPEC)`
      SELECT id, codigo::text AS codigo, nombre, tipo::text AS tipo, banco::text AS banco, numero_cuenta::text AS numero_cuenta,
             cci::text AS cci, moneda_id::text AS moneda_id, id_empresa, estado
        FROM cuenta_tesoreria WHERE (${soloActivas}::boolean = false OR estado) ORDER BY nombre`;
  }

  async create(dto: CreateCuentaDto): Promise<CuentaResponseDto> {
    const q = sqlTag(this.sql);
    const [dup] = await q.rows<{ id: number }>({ id: I })`SELECT id FROM cuenta_tesoreria WHERE codigo = ${dto.codigo}::text`;
    if (dup) throw new ConflictException(`Ya existe una cuenta con codigo ${dto.codigo}`);
    const [row] = await q.rows<CuentaResponseDto>(SPEC)`
      INSERT INTO cuenta_tesoreria (codigo, nombre, tipo, banco, numero_cuenta, cci, moneda_id, id_empresa)
      VALUES (${dto.codigo}::text, ${dto.nombre}::text, ${dto.tipo}::text, NULLIF(${dto.banco ?? ''}::text, ''),
              NULLIF(${dto.numero_cuenta ?? ''}::text, ''), NULLIF(${dto.cci ?? ''}::text, ''), ${dto.moneda_id.toUpperCase()}::text,
              NULLIF(${dto.id_empresa ?? 0}::int, 0))
      RETURNING id, codigo::text AS codigo, nombre, tipo::text AS tipo, banco::text AS banco, numero_cuenta::text AS numero_cuenta,
                cci::text AS cci, moneda_id::text AS moneda_id, id_empresa, estado`;
    return row;
  }

  async update(id: number, dto: UpdateCuentaDto): Promise<CuentaResponseDto> {
    const q = sqlTag(this.sql);
    const [row] = await q.rows<CuentaResponseDto>(SPEC)`
      UPDATE cuenta_tesoreria SET
        nombre = CASE WHEN ${dto.nombre !== undefined}::boolean THEN ${dto.nombre ?? ''}::text ELSE nombre END,
        banco = CASE WHEN ${dto.banco !== undefined}::boolean THEN NULLIF(${dto.banco ?? ''}::text, '') ELSE banco END,
        numero_cuenta = CASE WHEN ${dto.numero_cuenta !== undefined}::boolean THEN NULLIF(${dto.numero_cuenta ?? ''}::text, '') ELSE numero_cuenta END,
        cci = CASE WHEN ${dto.cci !== undefined}::boolean THEN NULLIF(${dto.cci ?? ''}::text, '') ELSE cci END,
        id_empresa = CASE WHEN ${dto.id_empresa !== undefined}::boolean THEN NULLIF(${dto.id_empresa ?? 0}::int, 0) ELSE id_empresa END,
        estado = CASE WHEN ${dto.estado !== undefined}::boolean THEN ${dto.estado ?? true}::boolean ELSE estado END
       WHERE id = ${id}::int
      RETURNING id, codigo::text AS codigo, nombre, tipo::text AS tipo, banco::text AS banco, numero_cuenta::text AS numero_cuenta,
                cci::text AS cci, moneda_id::text AS moneda_id, id_empresa, estado`;
    if (!row) throw new NotFoundException(`Cuenta ${id} no encontrada`);
    return row;
  }
}
