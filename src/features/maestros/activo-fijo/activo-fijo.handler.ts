import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Varchar } from '@prisma/orm-postgres/target/codec-types';
import { throwIfUniqueViolation } from '../../../platform/db/pg-errors.js';
import { toVarchar } from '../../../platform/db/varchar-helpers.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { generarEntregaDocx } from './entrega-equipos.docx.js';
import {
  BienCatalogoDto,
  EquipoAsignadoDto,
  DevolverEquipoDto,
  AsignarActivoDto,
  EquipoInventarioDto,
  CambiarEstadoDto,
  EstadoActivo,
  EstadoEquipo,
  MovimientoEquipoDto,
  TipoMovimiento,
  LocalOpcionDto,
  MoverEquipoDto,
  NuevaAsignacionDto,
  OpcionesEquipoDto,
  OpcionDestinoDto,
  ReasignarEquipoDto,
  RegistrarActivoDto,
} from './activo-fijo.dto.js';

const TIPO_POR_DEFECTO = 'Equipo';

interface DestinoLocal {
  destino: string | null;
  destinoTipo: 'EMPRESA' | 'CENTRO_COSTO' | null;
  destinoId: number | null;
}

function porNombre(a: { nombre: string }, b: { nombre: string }): number {
  return a.nombre.localeCompare(b.nombre, 'es');
}

/** El destino propio del equipo (empresa o centro de costo); si no lo tiene, el de su local. */
function destinoDeActivo(
  activo: { id_empresa: number | null; id_centro_costo: number | null },
  local: { id_empresa: number | null; id_centro_costo: number | null } | undefined,
  empresas: Map<number, string>,
  centros: Map<number, string>,
): DestinoLocal {
  if (activo.id_empresa !== null) {
    return { destino: empresas.get(activo.id_empresa) ?? null, destinoTipo: 'EMPRESA', destinoId: activo.id_empresa };
  }
  if (activo.id_centro_costo !== null) {
    return { destino: centros.get(activo.id_centro_costo) ?? null, destinoTipo: 'CENTRO_COSTO', destinoId: activo.id_centro_costo };
  }
  return destinoDeLocal(local, empresas, centros);
}

/** Un local pertenece a una empresa (sede) o a una obra / centro de costo (XOR): devuelve a cuál. */
function destinoDeLocal(
  local: { id_empresa: number | null; id_centro_costo: number | null } | undefined,
  empresas: Map<number, string>,
  centros: Map<number, string>,
): DestinoLocal {
  if (!local) return { destino: null, destinoTipo: null, destinoId: null };
  if (local.id_empresa) return { destino: empresas.get(local.id_empresa) ?? null, destinoTipo: 'EMPRESA', destinoId: local.id_empresa };
  if (local.id_centro_costo) return { destino: centros.get(local.id_centro_costo) ?? null, destinoTipo: 'CENTRO_COSTO', destinoId: local.id_centro_costo };
  return { destino: null, destinoTipo: null, destinoId: null };
}

type Movimiento = 'ASIGNACION' | 'REASIGNACION' | 'DEVOLUCION' | 'TRASLADO';

const ETIQUETA_MOVIMIENTO: Record<Movimiento, TipoMovimiento> = {
  ASIGNACION: 'Asignación',
  REASIGNACION: 'Reasignación',
  DEVOLUCION: 'Devolución',
  TRASLADO: 'Traslado',
};

const ETIQUETA_ESTADO: Record<string, EstadoEquipo> = {
  OPERATIVO: 'Operativo',
  NO_OPERATIVO: 'No operativo',
  EN_REPARACION: 'En reparación',
};

type ActivoRow = {
  id: number;
  codigo: Varchar<30>;
  id_producto: number;
  serie: Varchar<100> | null;
  estado: string;
  fecha_asignacion: string | null;
  id_responsable: number | null;
  id_ubicacion: number | null;
  id_area: number | null;
  id_empresa: number | null;
  id_centro_costo: number | null;
};

/** Lo necesario para crear un activo (lo comparten `asignar` y `registrarActivo`). */
interface DatosActivo {
  codigoBien: string;
  serie?: string | null;
  estado?: EstadoActivo;
  localId?: number;
  nivelId?: number;
  ambienteId?: number;
  areaId?: number;
  destinoTipo?: 'EMPRESA' | 'CENTRO_COSTO';
  destinoId?: number;
  caracteristicas?: Record<string, string>;
}

@Injectable()
export class ActivoFijoHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async opciones(): Promise<OpcionesEquipoDto> {
    const [productos, ubicaciones, locales, niveles, ambientes, areas, empresas, centros] = await Promise.all([
      this.db.orm.public.producto
        .where({ clase_inventario: 'ACTIVO_FIJO', estado: true })
        .orderBy((p) => p.codigo.asc())
        .all(),
      this.db.orm.public.ubicacion.where({ estado: true }).all(),
      this.db.orm.public.local.where({ estado: true }).all(),
      this.db.orm.public.nivel.where({ estado: true }).all(),
      this.db.orm.public.ambiente.where({ estado: true }).all(),
      this.db.orm.public.area
        .where({ estado: true })
        .orderBy((a) => a.nombre.asc())
        .all(),
      this.db.orm.public.Empresas.all(),
      this.db.orm.public.CentroCostos.all(),
    ]);

    const caracteristicasDelCatalogo = await this.caracteristicasDeProductos(productos.map((p) => p.id));
    const catalogo: BienCatalogoDto[] = productos.map((p) => {
      // «Tipo» (Laptop, PC, Celular...) identifica al equipo; no es una característica editable.
      const { Tipo, ...caracteristicas } = caracteristicasDelCatalogo.get(p.id) ?? {};
      return { id: p.id, codigo: p.codigo, descripcion: p.descripcion, tipo: Tipo ?? TIPO_POR_DEFECTO, caracteristicas };
    });

    const localPorId = new Map(locales.map((l) => [l.id, String(l.nombre)]));
    const localFilaPorId = new Map(locales.map((l) => [l.id, l]));
    const empresaPorId = new Map(empresas.map((e) => [e.id_empresa, String(e.razon_social ?? '')]));
    const centroPorId = new Map(centros.map((c) => [c.id, String(c.centro_costo ?? '')]));
    const nivelPorId = new Map(niveles.map((n) => [n.id, String(n.descripcion)]));
    const ambientePorId = new Map(ambientes.map((a) => [a.id, String(a.descripcion)]));
    const arbol = new Map<number, LocalOpcionDto>();
    for (const u of ubicaciones) {
      const nombreLocal = localPorId.get(u.id_local);
      const nombreNivel = nivelPorId.get(u.id_nivel);
      const nombreAmbiente = ambientePorId.get(u.id_ambiente);
      if (nombreLocal === undefined || nombreNivel === undefined || nombreAmbiente === undefined) continue;
      const local = arbol.get(u.id_local) ?? {
        id: u.id_local,
        nombre: nombreLocal,
        ...destinoDeLocal(localFilaPorId.get(u.id_local), empresaPorId, centroPorId),
        niveles: [],
      };
      arbol.set(u.id_local, local);
      let nivel = local.niveles.find((n) => n.id === u.id_nivel);
      if (!nivel) {
        nivel = { id: u.id_nivel, nombre: nombreNivel, ambientes: [] };
        local.niveles.push(nivel);
      }
      nivel.ambientes.push({ id: u.id_ambiente, nombre: nombreAmbiente, areaId: u.id_area });
    }
    return {
      catalogo,
      locales: [...arbol.values()],
      areas: areas.map((a) => ({ id: a.id, nombre: String(a.nombre) })),
      empresas: [...empresaPorId.entries()].map(([id, nombre]): OpcionDestinoDto => ({ id, nombre })).sort(porNombre),
      centrosCosto: centros
        .filter((c) => c.estado?.trim().toUpperCase() !== 'CERRADO' && c.centro_costo)
        .map((c): OpcionDestinoDto => ({ id: c.id, nombre: String(c.centro_costo) }))
        .sort(porNombre),
    };
  }

  /** Todos los equipos (asignados o no) para el tablero de equipos tecnológicos. */
  async inventario(): Promise<EquipoInventarioDto[]> {
    const activos = await this.db.orm.public.activo_fijo.orderBy((a) => a.id.desc()).all();
    return this.conResponsable(activos);
  }

  /** Registra un activo en el inventario, con o sin trabajador (sin trabajador queda disponible). */
  async registrarActivo(dto: RegistrarActivoDto): Promise<EquipoInventarioDto> {
    let responsable: { anexoId: number; fecha: string } | null = null;
    if (dto.anexoId !== undefined) {
      if (!dto.fechaAsignacion) {
        throw new BadRequestException('La fecha de asignación es obligatoria cuando se indica el trabajador');
      }
      await this.asegurarTrabajador(dto.anexoId);
      responsable = { anexoId: dto.anexoId, fecha: dto.fechaAsignacion };
    }
    const creado = await this.crearActivo(dto, responsable);
    const [equipo] = await this.conResponsable([creado]);
    if (!equipo) throw new NotFoundException('No se pudo leer el equipo registrado');
    return equipo;
  }

  /** Cambia el estado del equipo (operativo, no operativo o en reparación). */
  async cambiarEstado(equipoId: number, dto: CambiarEstadoDto): Promise<EquipoInventarioDto> {
    const activo = await this.db.orm.public.activo_fijo.first({ id: equipoId });
    if (!activo) throw new NotFoundException(`Equipo ${equipoId} no encontrado`);
    const actualizado = await this.db.orm.public.activo_fijo.where({ id: equipoId }).update({ estado: dto.estado });
    const [equipo] = actualizado ? await this.conResponsable([actualizado]) : [];
    if (!equipo) throw new NotFoundException('No se pudo leer el equipo');
    return equipo;
  }

  /** Cambia al equipo de empresa / centro de costo, ambiente o área (con o sin responsable); queda en el historial. */
  async mover(equipoId: number, dto: MoverEquipoDto): Promise<EquipoInventarioDto> {
    const antes = await this.db.orm.public.activo_fijo.first({ id: equipoId });
    if (!antes) throw new NotFoundException(`Equipo ${equipoId} no encontrado`);
    const { idUbicacion, idArea, destino } = await this.resolverUbicacionYDestino(dto);
    const nombreAntes = await this.nombreDestino(antes.id_empresa, antes.id_centro_costo);
    const nombreDespues = await this.nombreDestino(destino.idEmpresa, destino.idCentroCosto);
    const actualizado = await this.db.orm.public.activo_fijo.where({ id: equipoId }).update({
      id_ubicacion: idUbicacion,
      id_area: idArea,
      id_empresa: destino.idEmpresa,
      id_centro_costo: destino.idCentroCosto,
    });
    await this.registrar(equipoId, 'TRASLADO', dto.fecha, antes.id_responsable, antes.id_responsable, antes.id_ubicacion, idUbicacion, antes.id_area, idArea, nombreAntes, nombreDespues);
    const [equipo] = actualizado ? await this.conResponsable([actualizado]) : [];
    if (!equipo) throw new NotFoundException('No se pudo leer el equipo');
    return equipo;
  }

  /** Entrega a un trabajador un equipo que está disponible; para cambiarlo de persona se usa reasignar. */
  async asignarExistente(equipoId: number, dto: AsignarActivoDto): Promise<EquipoInventarioDto> {
    const activo = await this.db.orm.public.activo_fijo.first({ id: equipoId });
    if (!activo) throw new NotFoundException(`Equipo ${equipoId} no encontrado`);
    if (activo.id_responsable !== null) {
      throw new ConflictException('El equipo ya está asignado a un trabajador; use reasignar para cambiarlo de persona');
    }
    await this.asegurarTrabajador(dto.anexoId);
    const actualizado = await this.db.orm.public.activo_fijo
      .where({ id: equipoId })
      .update({ id_responsable: dto.anexoId, fecha_asignacion: dto.fechaAsignacion });
    const nombreDestino = await this.nombreDestino(activo.id_empresa, activo.id_centro_costo);
    await this.registrar(equipoId, 'ASIGNACION', dto.fechaAsignacion, null, dto.anexoId, activo.id_ubicacion, activo.id_ubicacion, activo.id_area, activo.id_area, nombreDestino, nombreDestino);
    const [equipo] = actualizado ? await this.conResponsable([actualizado]) : [];
    if (!equipo) throw new NotFoundException('No se pudo leer el equipo');
    return equipo;
  }

  async listar(anexoId: number): Promise<EquipoAsignadoDto[]> {
    await this.asegurarTrabajador(anexoId);
    const activos = await this.db.orm.public.activo_fijo
      .where({ id_responsable: anexoId })
      .orderBy((a) => a.id.desc())
      .all();
    return this.armar(activos);
  }

  async asignar(anexoId: number, dto: NuevaAsignacionDto): Promise<EquipoAsignadoDto> {
    await this.asegurarTrabajador(anexoId);
    const creado = await this.crearActivo(dto, { anexoId, fecha: dto.fechaAsignacion });
    const [equipo] = await this.armar([creado]);
    if (!equipo) throw new NotFoundException('No se pudo leer el equipo asignado');
    return equipo;
  }

  private async crearActivo(dto: DatosActivo, responsable: { anexoId: number; fecha: string } | null): Promise<ActivoRow> {
    const bien = await this.db.orm.public.producto.first({ codigo: dto.codigoBien });
    if (!bien || !bien.estado) throw new BadRequestException(`El bien "${dto.codigoBien}" no existe en el catálogo`);
    if (bien.clase_inventario !== 'ACTIVO_FIJO') {
      throw new BadRequestException(`El bien "${dto.codigoBien}" no es un activo fijo (equipo tecnológico)`);
    }

    const serie = dto.serie?.trim() || null;
    if (serie) {
      const repetida = await this.db.orm.public.activo_fijo.first({
        id_producto: bien.id,
        serie: toVarchar<100>(serie),
      });
      if (repetida) throw new ConflictException(`La serie "${serie}" ya está registrada para ese equipo`);
    }

    const { idUbicacion, idArea, destino } = await this.resolverUbicacionYDestino(dto);

    const [ultimo] = await this.db.orm.public.activo_fijo
      .orderBy((a) => a.id.desc())
      .limit(1)
      .all();
    const codigoActivo = `AF-${String((ultimo?.id ?? 0) + 1).padStart(4, '0')}`;

    let creado: ActivoRow;
    try {
      creado = await this.db.orm.public.activo_fijo.create({
        codigo: toVarchar<30>(codigoActivo),
        id_producto: bien.id,
        serie: serie ? toVarchar<100>(serie) : null,
        estado: dto.estado ?? 'OPERATIVO',
        fecha_asignacion: responsable?.fecha ?? null,
        id_responsable: responsable?.anexoId ?? null,
        id_ubicacion: idUbicacion,
        id_area: idArea,
        id_empresa: destino.idEmpresa,
        id_centro_costo: destino.idCentroCosto,
      });
    } catch (error) {
      throwIfUniqueViolation(error, `El código de activo "${codigoActivo}" ya existe, intente de nuevo`);
      throw error;
    }

    if (responsable) {
      const nombre = await this.nombreDestino(destino.idEmpresa, destino.idCentroCosto);
      await this.registrar(creado.id, 'ASIGNACION', responsable.fecha, null, responsable.anexoId, null, idUbicacion, null, idArea, null, nombre);
    }

    // Solo se guarda lo que cambia respecto al catálogo; lo demás se hereda.
    const delCatalogo = (await this.caracteristicasDeProductos([bien.id])).get(bien.id) ?? {};
    for (const [nombre, valor] of Object.entries(dto.caracteristicas ?? {})) {
      const n = nombre.trim();
      const v = String(valor).trim();
      if (!n || !v || delCatalogo[n] === v) continue;
      await this.db.orm.public.activo_fijo_caracteristica.create({
        id_activo_fijo: creado.id,
        nombre: toVarchar<60>(n),
        valor: toVarchar<150>(v),
      });
    }
    return creado;
  }

  private async conResponsable(activos: ActivoRow[]): Promise<EquipoInventarioDto[]> {
    const equipos = await this.armar(activos);
    const idsAnexo = [...new Set(activos.flatMap((a) => (a.id_responsable === null ? [] : [a.id_responsable])))];
    const anexos = idsAnexo.length > 0 ? await this.db.orm.public.Anexos.where((a) => a.id.in(idsAnexo)).all() : [];
    const nombrePorAnexo = new Map(anexos.map((a) => [a.id, String(a.Anexo ?? a.NombreComercial ?? `Anexo ${a.id}`)]));
    const responsablePorActivo = new Map(activos.map((a) => [a.id, a.id_responsable]));
    return equipos.map((e) => {
      const responsableId = responsablePorActivo.get(e.id) ?? null;
      return { ...e, responsableId, responsable: responsableId === null ? null : (nombrePorAnexo.get(responsableId) ?? null) };
    });
  }

  /**
   * Pasa el equipo a otro trabajador y, si se indica, a otro ambiente. La serie y las características
   * no cambian; el movimiento queda en el historial.
   */
  async reasignar(anexoId: number, equipoId: number, dto: ReasignarEquipoDto): Promise<EquipoAsignadoDto> {
    await this.asegurarTrabajador(anexoId);
    const antes = await this.asegurarEquipoDe(anexoId, equipoId);
    if (dto.anexoDestinoId === anexoId) throw new BadRequestException('El equipo ya está asignado a ese trabajador');
    await this.asegurarTrabajador(dto.anexoDestinoId);

    let idUbicacion = antes.id_ubicacion;
    let idArea = antes.id_area;
    let destinoNuevo = { idEmpresa: antes.id_empresa, idCentroCosto: antes.id_centro_costo };

    if (dto.destinoTipo !== undefined || dto.destinoId !== undefined) {
      // Cambia el destino: una empresa lleva ubicación (local, nivel, ambiente); un centro de costo, no.
      const r = await this.resolverUbicacionYDestino(dto);
      ({ idUbicacion, idArea, destino: destinoNuevo } = r);
    } else {
      const cambiaUbicacion = dto.localId !== undefined || dto.nivelId !== undefined || dto.ambienteId !== undefined;
      if (cambiaUbicacion && (dto.localId === undefined || dto.nivelId === undefined || dto.ambienteId === undefined)) {
        throw new BadRequestException('La nueva ubicación necesita local, nivel y ambiente');
      }
      const nueva =
        cambiaUbicacion && dto.localId !== undefined && dto.nivelId !== undefined && dto.ambienteId !== undefined
          ? await this.resolverUbicacion(dto.localId, dto.nivelId, dto.ambienteId)
          : null;
      idUbicacion = nueva ? nueva.id : antes.id_ubicacion;
      // Sin área explícita: si cambia la ubicación se toma la de esa ubicación; si no, se conserva.
      idArea = dto.areaId !== undefined || nueva ? await this.resolverArea(dto.areaId, nueva?.idArea ?? null) : antes.id_area;
      if (nueva) destinoNuevo = await this.resolverDestino(undefined, undefined, dto.localId);
    }
    const nombreAntes = await this.nombreDestino(antes.id_empresa, antes.id_centro_costo);
    const nombreDespues = await this.nombreDestino(destinoNuevo.idEmpresa, destinoNuevo.idCentroCosto);

    const actualizado = await this.db.orm.public.activo_fijo
      .where({ id: equipoId })
      .update({
        id_responsable: dto.anexoDestinoId,
        fecha_asignacion: dto.fechaAsignacion,
        id_ubicacion: idUbicacion,
        id_area: idArea,
        id_empresa: destinoNuevo.idEmpresa,
        id_centro_costo: destinoNuevo.idCentroCosto,
      });
    await this.registrar(
      equipoId,
      'REASIGNACION',
      dto.fechaAsignacion,
      anexoId,
      dto.anexoDestinoId,
      antes.id_ubicacion,
      idUbicacion,
      antes.id_area,
      idArea,
      nombreAntes,
      nombreDespues,
    );
    return this.equipoActualizado(actualizado);
  }

  /** El equipo vuelve a quedar sin responsable (disponible para asignarse de nuevo). */
  async devolver(anexoId: number, equipoId: number, dto: DevolverEquipoDto): Promise<EquipoAsignadoDto> {
    await this.asegurarTrabajador(anexoId);
    const antes = await this.asegurarEquipoDe(anexoId, equipoId);
    const actualizado = await this.db.orm.public.activo_fijo
      .where({ id: equipoId })
      .update({ id_responsable: null, fecha_asignacion: null });
    const nombreDestino = await this.nombreDestino(antes.id_empresa, antes.id_centro_costo);
    await this.registrar(equipoId, 'DEVOLUCION', dto.fecha, anexoId, null, antes.id_ubicacion, antes.id_ubicacion, antes.id_area, antes.id_area, nombreDestino, nombreDestino);
    return this.equipoActualizado(actualizado);
  }

  /**
   * Hoja «Entrega de equipos» (.docx) para quien recibe: nombre, DNI, fecha y los equipos indicados
   * (o todos los que tiene asignados). La fecha por defecto es la de asignación del equipo.
   */
  async entrega(anexoId: number, ids: number[], fecha?: string): Promise<{ archivo: Buffer; nombre: string }> {
    const anexo = await this.asegurarTrabajador(anexoId);
    const asignados = await this.listar(anexoId);
    const equipos = ids.length > 0 ? asignados.filter((e) => ids.includes(e.id)) : asignados;
    if (equipos.length === 0) throw new NotFoundException('El trabajador no tiene equipos asignados para entregar');
    if (ids.length > 0 && equipos.length !== new Set(ids).size) {
      throw new NotFoundException('Alguno de los equipos no está asignado a este trabajador');
    }

    const nombre = String(anexo.Anexo ?? anexo.NombreComercial ?? `Anexo ${anexo.id}`);
    const archivo = await generarEntregaDocx({
      nombre,
      dni: String(anexo.NumeroDocIde ?? ''),
      fecha: fecha ?? equipos[0]?.fechaAsignacion ?? '',
      filas: equipos.map((e) => ({
        modelo: e.modelo,
        marca: e.marca,
        serie: e.serie ?? '',
        descripcion: e.tipo.toUpperCase(),
        cantidad: e.cantidad,
        observaciones: '',
      })),
    });
    return { archivo, nombre: `ENTREGA DE EQUIPOS - ${nombre}.docx` };
  }

  /** Movimientos del equipo, del más reciente al más antiguo. */
  async historial(equipoId: number): Promise<MovimientoEquipoDto[]> {
    const equipo = await this.db.orm.public.activo_fijo.first({ id: equipoId });
    if (!equipo) throw new NotFoundException(`Equipo ${equipoId} no encontrado`);
    const filas = await this.db.orm.public.activo_fijo_historial
      .where({ id_activo_fijo: equipoId })
      .orderBy((h) => h.id.desc())
      .all();
    if (filas.length === 0) return [];

    const idsAnexo = [
      ...new Set(filas.flatMap((f) => [f.id_responsable_anterior, f.id_responsable_nuevo]).filter((id): id is number => id !== null)),
    ];
    const idsUbicacion = [
      ...new Set(filas.flatMap((f) => [f.id_ubicacion_anterior, f.id_ubicacion_nueva]).filter((id): id is number => id !== null)),
    ];
    const [anexos, ubicaciones, locales, niveles, ambientes, areas] = await Promise.all([
      idsAnexo.length > 0 ? this.db.orm.public.Anexos.where((a) => a.id.in(idsAnexo)).all() : Promise.resolve([]),
      idsUbicacion.length > 0 ? this.db.orm.public.ubicacion.where((u) => u.id.in(idsUbicacion)).all() : Promise.resolve([]),
      this.db.orm.public.local.all(),
      this.db.orm.public.nivel.all(),
      this.db.orm.public.ambiente.all(),
      this.db.orm.public.area.all(),
    ]);
    const areaPorId = new Map(areas.map((a) => [a.id, String(a.nombre)]));
    const anexoPorId = new Map(anexos.map((a) => [a.id, String(a.Anexo ?? a.NombreComercial ?? `Anexo ${a.id}`)]));
    const localPorId = new Map(locales.map((l) => [l.id, String(l.nombre)]));
    const nivelPorId = new Map(niveles.map((n) => [n.id, String(n.descripcion)]));
    const ambientePorId = new Map(ambientes.map((a) => [a.id, String(a.descripcion)]));
    const ubicacionPorId = new Map(
      ubicaciones.map((u) => [
        u.id,
        [localPorId.get(u.id_local), nivelPorId.get(u.id_nivel), ambientePorId.get(u.id_ambiente)].filter(Boolean).join(' / '),
      ]),
    );
    const nombreAnexo = (id: number | null): string | null => (id === null ? null : (anexoPorId.get(id) ?? `Anexo ${id}`));
    const nombreUbicacion = (id: number | null): string | null => (id === null ? null : (ubicacionPorId.get(id) ?? null));

    return filas.map((f) => ({
      id: f.id,
      movimiento: ETIQUETA_MOVIMIENTO[f.movimiento],
      fecha: f.fecha,
      responsableAnterior: nombreAnexo(f.id_responsable_anterior),
      responsableNuevo: nombreAnexo(f.id_responsable_nuevo),
      ubicacionAnterior: nombreUbicacion(f.id_ubicacion_anterior),
      ubicacionNueva: nombreUbicacion(f.id_ubicacion_nueva),
      areaAnterior: f.id_area_anterior === null ? null : (areaPorId.get(f.id_area_anterior) ?? null),
      areaNueva: f.id_area_nueva === null ? null : (areaPorId.get(f.id_area_nueva) ?? null),
      destinoAnterior: f.destino_anterior === null ? null : String(f.destino_anterior),
      destinoNuevo: f.destino_nuevo === null ? null : String(f.destino_nuevo),
    }));
  }

  private async registrar(
    equipoId: number,
    movimiento: Movimiento,
    fecha: string,
    responsableAnterior: number | null,
    responsableNuevo: number | null,
    ubicacionAnterior: number | null,
    ubicacionNueva: number | null,
    areaAnterior: number | null,
    areaNueva: number | null,
    destinoAnterior: string | null = null,
    destinoNuevo: string | null = null,
  ): Promise<void> {
    await this.db.orm.public.activo_fijo_historial.create({
      id_activo_fijo: equipoId,
      movimiento,
      fecha,
      id_responsable_anterior: responsableAnterior,
      id_responsable_nuevo: responsableNuevo,
      id_ubicacion_anterior: ubicacionAnterior,
      id_ubicacion_nueva: ubicacionNueva,
      id_area_anterior: areaAnterior,
      id_area_nueva: areaNueva,
      destino_anterior: destinoAnterior === null ? null : toVarchar<255>(destinoAnterior),
      destino_nuevo: destinoNuevo === null ? null : toVarchar<255>(destinoNuevo),
    });
  }

  private async asegurarEquipoDe(anexoId: number, equipoId: number): Promise<ActivoRow> {
    const equipo = await this.db.orm.public.activo_fijo.first({ id: equipoId });
    if (!equipo || equipo.id_responsable !== anexoId) {
      throw new NotFoundException(`El equipo ${equipoId} no está asignado al anexo ${anexoId}`);
    }
    return equipo;
  }

  private async equipoActualizado(fila: ActivoRow | null): Promise<EquipoAsignadoDto> {
    const [equipo] = fila ? await this.armar([fila]) : [];
    if (!equipo) throw new NotFoundException('No se pudo leer el equipo');
    return equipo;
  }

  private async caracteristicasDeProductos(idsProducto: number[]): Promise<Map<number, Record<string, string>>> {
    const porProducto = new Map<number, Record<string, string>>();
    if (idsProducto.length === 0) return porProducto;
    const filas = await this.db.orm.public.producto_caracteristica
      .where((c) => c.id_producto.in(idsProducto))
      .orderBy((c) => c.id.asc())
      .all();
    for (const f of filas) {
      const actual = porProducto.get(f.id_producto) ?? {};
      actual[String(f.nombre)] = String(f.valor);
      porProducto.set(f.id_producto, actual);
    }
    return porProducto;
  }

  private async asegurarTrabajador(anexoId: number) {
    const anexo = await this.db.orm.public.Anexos.first({ id: anexoId });
    if (!anexo) throw new NotFoundException(`Anexo ${anexoId} no encontrado`);
    if (anexo.tipoAnexo !== 'Trabajador') {
      throw new BadRequestException('Solo los anexos de tipo Trabajador pueden tener equipos asignados');
    }
    return anexo;
  }

  /**
   * Resuelve a dónde va el equipo. Centro de costo: se asigna al centro y no lleva ubicación física.
   * Empresa (o sin tipo, tomando el de su local): exige local, nivel y ambiente, y el local debe ser de esa empresa.
   */
  private async resolverUbicacionYDestino(dto: {
    localId?: number;
    nivelId?: number;
    ambienteId?: number;
    areaId?: number;
    destinoTipo?: 'EMPRESA' | 'CENTRO_COSTO';
    destinoId?: number;
  }): Promise<{ idUbicacion: number | null; idArea: number | null; destino: { idEmpresa: number | null; idCentroCosto: number | null } }> {
    if ((dto.destinoTipo === undefined) !== (dto.destinoId === undefined)) {
      throw new BadRequestException('El destino necesita el tipo (empresa o centro de costo) y su id');
    }
    if (dto.destinoTipo === 'CENTRO_COSTO' && dto.destinoId !== undefined) {
      const centro = await this.db.orm.public.CentroCostos.first({ id: dto.destinoId });
      if (!centro) throw new BadRequestException(`El centro de costo ${dto.destinoId} no existe`);
      const idArea = dto.areaId === undefined ? null : await this.resolverArea(dto.areaId, null);
      return { idUbicacion: null, idArea, destino: { idEmpresa: null, idCentroCosto: dto.destinoId } };
    }
    if (dto.localId === undefined || dto.nivelId === undefined || dto.ambienteId === undefined) {
      throw new BadRequestException('Selecciona local, nivel y ambiente');
    }
    const local = await this.db.orm.public.local.first({ id: dto.localId });
    if (!local) throw new BadRequestException('Local, nivel o ambiente inexistente');
    let destino = { idEmpresa: local.id_empresa, idCentroCosto: local.id_centro_costo };
    if (dto.destinoTipo === 'EMPRESA' && dto.destinoId !== undefined) {
      const empresa = await this.db.orm.public.Empresas.first({ id_empresa: dto.destinoId });
      if (!empresa) throw new BadRequestException(`La empresa ${dto.destinoId} no existe`);
      if (local.id_empresa !== dto.destinoId) throw new BadRequestException('El local no pertenece a la empresa elegida');
      destino = { idEmpresa: dto.destinoId, idCentroCosto: null };
    }
    const ubicacion = await this.resolverUbicacion(dto.localId, dto.nivelId, dto.ambienteId);
    const idArea = await this.resolverArea(dto.areaId, ubicacion.idArea);
    return { idUbicacion: ubicacion.id, idArea, destino };
  }

  private async resolverDestino(
    tipo: 'EMPRESA' | 'CENTRO_COSTO' | undefined,
    id: number | undefined,
    localId: number | undefined,
  ): Promise<{ idEmpresa: number | null; idCentroCosto: number | null }> {
    if (tipo !== undefined && id !== undefined) {
      return tipo === 'EMPRESA' ? { idEmpresa: id, idCentroCosto: null } : { idEmpresa: null, idCentroCosto: id };
    }
    const local = localId === undefined ? null : await this.db.orm.public.local.first({ id: localId });
    return { idEmpresa: local?.id_empresa ?? null, idCentroCosto: local?.id_centro_costo ?? null };
  }

  private async nombreDestino(idEmpresa: number | null, idCentroCosto: number | null): Promise<string | null> {
    if (idEmpresa !== null) {
      const empresa = await this.db.orm.public.Empresas.first({ id_empresa: idEmpresa });
      return empresa ? `Empresa: ${String(empresa.razon_social ?? '')}` : null;
    }
    if (idCentroCosto !== null) {
      const centro = await this.db.orm.public.CentroCostos.first({ id: idCentroCosto });
      return centro ? `Centro de costo: ${String(centro.centro_costo ?? '')}` : null;
    }
    return null;
  }

  /** El área indicada (o, si no hay, la de la ubicación); debe existir. */
  private async resolverArea(areaId: number | undefined, porDefecto: number | null): Promise<number | null> {
    if (areaId === undefined) return porDefecto;
    const area = await this.db.orm.public.area.first({ id: areaId });
    if (!area) throw new BadRequestException(`El área ${areaId} no existe`);
    return area.id;
  }

  private async resolverUbicacion(
    localId: number,
    nivelId: number,
    ambienteId: number,
  ): Promise<{ id: number; idArea: number | null }> {
    const existente = await this.db.orm.public.ubicacion.first({
      id_local: localId,
      id_nivel: nivelId,
      id_ambiente: ambienteId,
    });
    if (existente) return { id: existente.id, idArea: existente.id_area };

    const [local, nivel, ambiente] = await Promise.all([
      this.db.orm.public.local.first({ id: localId }),
      this.db.orm.public.nivel.first({ id: nivelId }),
      this.db.orm.public.ambiente.first({ id: ambienteId }),
    ]);
    if (!local || !nivel || !ambiente) {
      throw new BadRequestException('Local, nivel o ambiente inexistente');
    }
    const codigo = `${String(local.codigo)}-${String(nivel.codigo)}-${String(ambiente.codigo)}`.toUpperCase();
    const creada = await this.db.orm.public.ubicacion.create({
      codigo: toVarchar<50>(codigo),
      id_local: localId,
      id_nivel: nivelId,
      id_ambiente: ambienteId,
      id_area: null,
      observaciones: null,
      estado: true,
    });
    return { id: creada.id, idArea: null };
  }

  private async armar(activos: ActivoRow[]): Promise<EquipoAsignadoDto[]> {
    if (activos.length === 0) return [];
    const idsActivo = activos.map((a) => a.id);
    const idsProducto = [...new Set(activos.map((a) => a.id_producto))];
    const idsUbicacion = [...new Set(activos.flatMap((a) => (a.id_ubicacion === null ? [] : [a.id_ubicacion])))];

    const [productos, propias, ubicaciones, locales, niveles, ambientes, areas, empresas, centros] =
      await Promise.all([
        this.db.orm.public.producto.where((p) => p.id.in(idsProducto)).all(),
        this.db.orm.public.activo_fijo_caracteristica
          .where((c) => c.id_activo_fijo.in(idsActivo))
          .orderBy((c) => c.id.asc())
          .all(),
        idsUbicacion.length > 0
          ? this.db.orm.public.ubicacion.where((u) => u.id.in(idsUbicacion)).all()
          : Promise.resolve([]),
        this.db.orm.public.local.all(),
        this.db.orm.public.nivel.all(),
        this.db.orm.public.ambiente.all(),
        this.db.orm.public.area.all(),
        this.db.orm.public.Empresas.all(),
        this.db.orm.public.CentroCostos.all(),
      ]);

    const empresaPorId = new Map(empresas.map((e) => [e.id_empresa, String(e.razon_social ?? '')]));
    const centroPorId = new Map(centros.map((c) => [c.id, String(c.centro_costo ?? '')]));
    const localFilaPorId = new Map(locales.map((l) => [l.id, l]));
    const areaPorId = new Map(areas.map((a) => [a.id, String(a.nombre)]));
    const productoPorId = new Map(productos.map((p) => [p.id, p]));
    const ubicacionPorId = new Map(ubicaciones.map((u) => [u.id, u]));
    const localPorId = new Map(locales.map((l) => [l.id, String(l.nombre)]));
    const nivelPorId = new Map(niveles.map((n) => [n.id, String(n.descripcion)]));
    const ambientePorId = new Map(ambientes.map((a) => [a.id, String(a.descripcion)]));

    const delCatalogo = await this.caracteristicasDeProductos(idsProducto);
    const propiasPorActivo = new Map<number, Record<string, string>>();
    for (const c of propias) {
      const actual = propiasPorActivo.get(c.id_activo_fijo) ?? {};
      actual[String(c.nombre)] = String(c.valor);
      propiasPorActivo.set(c.id_activo_fijo, actual);
    }

    return activos.map((a) => {
      const producto = productoPorId.get(a.id_producto);
      const ubicacion = a.id_ubicacion !== null ? ubicacionPorId.get(a.id_ubicacion) : undefined;
      // Efectivas = las del catálogo, reemplazadas por las propias de la unidad.
      const efectivas = { ...(delCatalogo.get(a.id_producto) ?? {}), ...(propiasPorActivo.get(a.id) ?? {}) };
      const { Tipo, Marca, Modelo, Color, ...otras } = efectivas;
      return {
        id: a.id,
        codigo: producto?.codigo ?? '',
        codigoActivo: String(a.codigo),
        tipo: Tipo ?? TIPO_POR_DEFECTO,
        marca: Marca ?? '',
        modelo: Modelo ?? '',
        color: Color ?? null,
        serie: a.serie === null ? null : String(a.serie),
        cantidad: 1,
        estado: ETIQUETA_ESTADO[a.estado] ?? 'Operativo',
        fechaAsignacion: a.fecha_asignacion ?? '',
        caracteristicas: otras,
        localId: ubicacion?.id_local ?? 0,
        local: ubicacion ? (localPorId.get(ubicacion.id_local) ?? '') : '',
        nivelId: ubicacion?.id_nivel ?? 0,
        nivel: ubicacion ? (nivelPorId.get(ubicacion.id_nivel) ?? '') : '',
        ambienteId: ubicacion?.id_ambiente ?? 0,
        ambiente: ubicacion ? (ambientePorId.get(ubicacion.id_ambiente) ?? '') : '',
        areaId: a.id_area,
        area: a.id_area === null ? null : (areaPorId.get(a.id_area) ?? null),
        ...destinoDeActivo(a, ubicacion ? localFilaPorId.get(ubicacion.id_local) : undefined, empresaPorId, centroPorId),
      };
    });
  }
}
