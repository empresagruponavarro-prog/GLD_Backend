import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import {
  PlantillaCompletaResponseDto,
  PlantillaResponseDto,
  CreatePlantillaDto,
  AplicarPlantillaDto,
  AplicarPlantillaResultDto,
  UpsertPlantillaFaseDto,
} from './plantillas.dto.js';
import { toVarchar, toDecimalString } from '../presupuestos.helpers.js';
import { sumarTotales } from '../plantillas-items/plantillas-items.handler.js';

@Injectable()
export class PlantillasHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async listActivas(): Promise<any[]> {
    const plantillas = await this.db.orm.public.ppto_Plantillas
      .where({ Activo: true })
      .orderBy((p: any) => p.id.desc())
      .all();

    return Promise.all(plantillas.map(async (p: any) => {
      const idVarchar = toVarchar(p.IdPlantilla);
      const fases = await this.db.orm.public.ppto_Plantillas_Fases
        .where((f: any) => f.IdPlantilla.eq(idVarchar))
        .all();
      
      let catCount = 0;
      for (const f of fases) {
        const cats = await this.db.orm.public.ppto_Plantillas_Categorias
          .where((c: any) => c.IdPlantillaFase.eq(f.IdPlantillaFase))
          .all();
        catCount += cats.length;
      }

      return {
        id: p.id,
        IdPlantilla: p.IdPlantilla as string,
        Nombre: p.Nombre as string,
        Descripcion: p.Descripcion as string | undefined,
        Activo: p.Activo,
        FechaCreacion: p.FechaCreacion?.toString() as string,
        totalFases: fases.length,
        totalCategorias: catCount
      };
    }));
  }

  async getCompleta(idPlantilla: string): Promise<PlantillaCompletaResponseDto> {
    const plantilla = await this.db.orm.public.ppto_Plantillas.first({ IdPlantilla: toVarchar(idPlantilla) });
    if (!plantilla) throw new NotFoundException(`Plantilla ${idPlantilla} no encontrada`);

    const fases = await this.db.orm.public.ppto_Plantillas_Fases
      .where((f: any) => f.IdPlantilla.eq(toVarchar(idPlantilla)))
      .orderBy((f: any) => f.Orden.asc())
      .all();

    const resultFases = await Promise.all(
      fases.map(async (fase: any) => {
        // Buscar el nombre real de la fase maestra
        const faseMaestra = await this.db.orm.public.ppto_Fases.first({ IdpptoFase: fase.IdpptoFase });
        
        const categorias = await this.db.orm.public.ppto_Plantillas_Categorias
          .where((c: any) => c.IdPlantillaFase.eq(fase.IdPlantillaFase))
          .all();

        const resultCats = await Promise.all(
          categorias.map(async (cat: any) => {
            const catMaestra = await this.db.orm.public.ppto_FasesCategorias.first({ IdpptoFaseCategoria: cat.IdpptoFaseCategoria });
            const catGlobal = cat.id_categoria ? await this.db.orm.public.categoria.first({ id: cat.id_categoria }) : null;
            const items = await this.db.orm.public.ppto_Plantillas_Items
              .where((i: any) => i.id_plantilla_categoria.eq(cat.id))
              .all();
            const totales = sumarTotales(items.map((i: any) => ({ CostoTotal: Number(i.CostoTotal), VentaTotal: Number(i.VentaTotal) })));
            return {
              id: cat.id,
              IdPlantillaFase: cat.IdPlantillaFase as string,
              IdpptoFaseCategoria: cat.IdpptoFaseCategoria as string,
              NombreCategoria: catMaestra?.Descripcion as string | undefined,
              CostoReferencial: cat.CostoReferencial ? Number(cat.CostoReferencial) : undefined,
              id_categoria: cat.id_categoria as number | undefined,
              categoria: catGlobal ? { id: catGlobal.id, descripcion: catGlobal.descripcion as string } : undefined,
              totalItems: items.length,
              VentaReferencial: items.length ? totales.ventaTotal : undefined,
            };
          })
        );

        return {
          id: fase.id,
          IdPlantillaFase: fase.IdPlantillaFase as string,
          IdpptoFase: fase.IdpptoFase as string,
          NombreFase: faseMaestra?.FaseProyecto as string | undefined,
          Orden: fase.Orden,
          categorias: resultCats,
        };
      })
    );

    return {
      id: plantilla.id,
      IdPlantilla: plantilla.IdPlantilla as string,
      Nombre: plantilla.Nombre as string,
      Descripcion: plantilla.Descripcion as string | undefined,
      Activo: plantilla.Activo,
      FechaCreacion: plantilla.FechaCreacion?.toString() as string,
      fases: resultFases,
    };
  }

  /**
   * Copia las fases y categorías de una plantilla en un presupuesto existente.
   *
   * - Modo `agregar` (por defecto): conserva lo que ya tiene el presupuesto y solo inserta
   *   las fases/categorías que faltan (no duplica: misma fase → se reutiliza su detalle;
   *   misma categoría dentro de la fase → se omite).
   * - Modo `reemplazar`: borra antes todas las fases y categorías del presupuesto.
   * - El contexto (empresa, centro de costo) se toma del propio presupuesto.
   * - Todo corre en una transacción: si algo falla, no queda nada a medias.
   */
  async aplicarPlantilla(idPresupuesto: string, dto: AplicarPlantillaDto): Promise<AplicarPlantillaResultDto> {
    const presupuesto = await this.db.orm.public.ppto_Principal.first({ IdPresupuesto: toVarchar(idPresupuesto) });
    if (!presupuesto) throw new NotFoundException(`Presupuesto ${idPresupuesto} no encontrado`);

    const plantillaCompleta = await this.getCompleta(dto.IdPlantilla);
    const modo = dto.Modo ?? 'agregar';
    const usuario = toVarchar(dto.Usuario || 'SISTEMA_PLANTILLA');
    const ahora = toVarchar(new Date().toISOString());
    const stamp = Date.now();

    const contexto = {
      IdPresupuesto: toVarchar(idPresupuesto),
      id_empresa: presupuesto.id_empresa ?? dto.id_empresa,
      CodCentroCtoPrincipal: toVarchar((presupuesto.CodCentroCtoPrincipal as string | null) ?? dto.CodCentroCtoPrincipal ?? ''),
      CodCentroCto: toVarchar((presupuesto.CodCentroCto as string | null) ?? dto.CodCentroCto ?? ''),
      id_centro_costo: presupuesto.id_centro_costo ?? dto.id_centro_costo,
    };

    return this.db.transaction(async (tx) => {
      const orm = tx.orm.public;

      if (modo === 'reemplazar') {
        await orm.ppto_DetalleFasesCate.where((c: any) => c.IdPresupuesto.eq(toVarchar(idPresupuesto))).deleteAndCount();
        await orm.ppto_DetalleFases.where((d: any) => d.IdPresupuesto.eq(toVarchar(idPresupuesto))).deleteAndCount();
      }

      const fasesExistentes = await orm.ppto_DetalleFases
        .where((d: any) => d.IdPresupuesto.eq(toVarchar(idPresupuesto)))
        .all();
      const catsExistentes = await orm.ppto_DetalleFasesCate
        .where((c: any) => c.IdPresupuesto.eq(toVarchar(idPresupuesto)))
        .all();

      // IdpptoFase -> IdPresupuestoDetalle (el primero, si hubiera duplicados históricos)
      const detallePorFase = new Map<string, string>();
      for (const f of fasesExistentes) {
        if (f.IdpptoFase && f.IdPresupuestoDetalle && !detallePorFase.has(f.IdpptoFase)) {
          detallePorFase.set(f.IdpptoFase, f.IdPresupuestoDetalle);
        }
      }
      // "IdPresupuestoDetalle|IdpptoFaseCategoria" ya presentes
      const catsPresentes = new Set(
        catsExistentes.map((c: any) => `${c.IdPresupuestoDetalle}|${c.IdpptoFaseCategoria}`),
      );

      let fasesAgregadas = 0;
      let categoriasAgregadas = 0;
      let fasesOmitidas = 0;
      let categoriasOmitidas = 0;
      const detallesTocados = new Set<string>();

      for (const [i, fase] of plantillaCompleta.fases.entries()) {
        let idDetalle = detallePorFase.get(fase.IdpptoFase);
        if (idDetalle) {
          fasesOmitidas++;
        } else {
          idDetalle = `DF-${stamp}-${i}`;
          await orm.ppto_DetalleFases.create({
            ...contexto,
            IdPresupuestoDetalle: toVarchar(idDetalle),
            IdpptoFase: toVarchar(fase.IdpptoFase),
            CostoDirecto: toDecimalString(0),
            Usuario: usuario,
            FechaCreacion: ahora,
          });
          detallePorFase.set(fase.IdpptoFase, idDetalle);
          fasesAgregadas++;
        }

        for (const [j, cat] of (fase.categorias ?? []).entries()) {
          if (!cat.IdpptoFaseCategoria) continue;
          const clave = `${idDetalle}|${cat.IdpptoFaseCategoria}`;
          if (catsPresentes.has(clave)) {
            categoriasOmitidas++;
            continue;
          }
          const nuevaCat = await orm.ppto_DetalleFasesCate.create({
            IdPresupuestoDetalleCategoria: toVarchar(`DFC-${stamp}-${i}-${j}`),
            IdPresupuestoDetalle: toVarchar(idDetalle),
            IdPresupuesto: contexto.IdPresupuesto,
            IdpptoFase: toVarchar(fase.IdpptoFase),
            IdpptoFaseCategoria: toVarchar(cat.IdpptoFaseCategoria),
            id_empresa: contexto.id_empresa,
            CodCentroCto: contexto.CodCentroCto,
            id_centro_costo: contexto.id_centro_costo,
            CostoDirecto: toDecimalString(cat.CostoReferencial ?? 0),
            Usuario: usuario,
            FechaCreacion: ahora,
          });
          catsPresentes.add(clave);
          detallesTocados.add(idDetalle);
          categoriasAgregadas++;

          // Si la partida de la plantilla tiene ítems, copiarlos a ppto_DetalleItems
          if (cat.id) {
            const itemsPlantilla = await orm.ppto_Plantillas_Items
              .where((it: any) => it.id_plantilla_categoria.eq(cat.id))
              .orderBy((it: any) => it.Orden.asc())
              .all();

            for (const it of itemsPlantilla) {
              await orm.ppto_DetalleItems.create({
                id_detalle_categoria: nuevaCat.id,
                IdPresupuesto: contexto.IdPresupuesto,
                id_producto: it.id_producto,
                id_unidad_medida: it.id_unidad_medida,
                Item: it.Item,
                Cantidad: it.Cantidad,
                CostoUnitario: it.CostoUnitario,
                PrecioVenta: it.PrecioVenta,
                CostoTotal: it.CostoTotal,
                VentaTotal: it.VentaTotal,
                Orden: it.Orden,
              });
            }
          }
        }
      }

      // El costo directo de la fase es la suma de sus categorías.
      for (const idDetalle of detallesTocados) {
        const cats = await orm.ppto_DetalleFasesCate
          .where((c: any) => c.IdPresupuestoDetalle.eq(toVarchar(idDetalle)))
          .all();
        const suma = cats.reduce((acc: number, c: any) => acc + (Number(c.CostoDirecto) || 0), 0);
        await orm.ppto_DetalleFases
          .where((f: any) => f.IdPresupuestoDetalle.eq(toVarchar(idDetalle)))
          .update({ CostoDirecto: toDecimalString(suma) });
      }

      return { success: true, modo, fasesAgregadas, categoriasAgregadas, fasesOmitidas, categoriasOmitidas };
    });
  }

  async listTodas(): Promise<PlantillaResponseDto[]> {
    const plantillas = await this.db.orm.public.ppto_Plantillas
      .orderBy((p: any) => p.id.desc())
      .all();

    return plantillas.map((p: any) => ({
      id: p.id,
      IdPlantilla: p.IdPlantilla as string,
      Nombre: p.Nombre as string,
      Descripcion: p.Descripcion as string | undefined,
      Activo: p.Activo,
      FechaCreacion: p.FechaCreacion?.toString() as string,
    }));
  }

  async createPlantilla(dto: CreatePlantillaDto): Promise<PlantillaResponseDto> {
    const IdPlantilla = dto.IdPlantilla || `TPL-${Date.now()}`;
    const created = await this.db.orm.public.ppto_Plantillas.create({
      IdPlantilla: toVarchar(IdPlantilla),
      Nombre: toVarchar(dto.Nombre),
      Descripcion: dto.Descripcion ? toVarchar(dto.Descripcion) : undefined,
    });
    return this.mapToResponse(created);
  }

  async updatePlantilla(idPlantilla: string, dto: any): Promise<PlantillaResponseDto> {
    const plantilla = await this.db.orm.public.ppto_Plantillas.first({ IdPlantilla: toVarchar(idPlantilla) });
    if (!plantilla) throw new NotFoundException('Plantilla no encontrada');

    const updateData: any = {};
    if (dto.Nombre !== undefined) updateData.Nombre = toVarchar(dto.Nombre);
    if (dto.Descripcion !== undefined) updateData.Descripcion = toVarchar(dto.Descripcion);
    if (dto.Activo !== undefined) updateData.Activo = dto.Activo;

    const updated = await this.db.orm.public.ppto_Plantillas.where({ IdPlantilla: toVarchar(idPlantilla) }).update(updateData);
    return this.mapToResponse(updated);
  }

  /**
   * Sincroniza la estructura (fases y partidas) de la plantilla en una transacción.
   *
   * - Fase: se reconoce por `IdPlantillaFase` (solo entre las fases de ESTA plantilla;
   *   un código ajeno, p. ej. al copiar de otra plantilla, se trata como fase nueva).
   * - Partida: se reconoce por `id` (solo entre las partidas actuales de la plantilla).
   *   Se conservan `id_categoria` y sus ítems; si la partida tiene ítems, su
   *   `CostoReferencial` lo manda la suma de ítems y no se sobrescribe.
   * - Lo que no viene en el payload se elimina (los ítems caen en cascada).
   */
  async updateFases(idPlantilla: string, fases: UpsertPlantillaFaseDto[]): Promise<{ success: boolean }> {
    const idVarchar = toVarchar(idPlantilla);
    const plantilla = await this.db.orm.public.ppto_Plantillas.first({ IdPlantilla: idVarchar });
    if (!plantilla) throw new NotFoundException('Plantilla no encontrada');
    const stamp = Date.now();
    const entrada = Array.isArray(fases) ? fases : [];

    await this.db.transaction(async (tx) => {
      const orm = tx.orm.public;
      const fasesActuales = await orm.ppto_Plantillas_Fases.where((f: any) => f.IdPlantilla.eq(idVarchar)).all();
      const codigosActuales = fasesActuales.map((f: any) => f.IdPlantillaFase as string).filter(Boolean);
      const catsActuales = codigosActuales.length
        ? await orm.ppto_Plantillas_Categorias.where((c: any) => c.IdPlantillaFase.in(codigosActuales)).all()
        : [];
      const idsCats = catsActuales.map((c: any) => c.id as number);
      const itemsActuales = idsCats.length
        ? await orm.ppto_Plantillas_Items.where((i: any) => i.id_plantilla_categoria.in(idsCats)).all()
        : [];

      const fasesExistentes = new Set<string>(codigosActuales);
      const catsExistentes = new Set<number>(idsCats);
      const catsConItems = new Set<number>(itemsActuales.map((i: any) => i.id_plantilla_categoria as number));
      const fasesConservadas = new Set<string>();
      const catsConservadas = new Set<number>();

      for (const [i, f] of entrada.entries()) {
        let codigo = f.IdPlantillaFase && fasesExistentes.has(f.IdPlantillaFase) && !fasesConservadas.has(f.IdPlantillaFase)
          ? f.IdPlantillaFase
          : undefined;
        if (codigo) {
          await orm.ppto_Plantillas_Fases
            .where({ IdPlantillaFase: toVarchar(codigo) })
            .update({ IdpptoFase: toVarchar(f.IdpptoFase), Orden: f.Orden ?? i });
        } else {
          codigo = `TPLF-${stamp}-${i}`;
          await orm.ppto_Plantillas_Fases.create({
            IdPlantillaFase: toVarchar(codigo),
            IdPlantilla: idVarchar,
            IdpptoFase: toVarchar(f.IdpptoFase),
            Orden: f.Orden ?? i,
          });
        }
        fasesConservadas.add(codigo);

        for (const cat of f.categorias ?? []) {
          const costo = cat.CostoReferencial !== undefined && cat.CostoReferencial !== null
            ? toDecimalString(Number(cat.CostoReferencial) || 0)
            : null;
          const idCategoria = cat.id_categoria ? Number(cat.id_categoria) : null;
          const idCat = cat.id ? Number(cat.id) : 0;

          if (idCat && catsExistentes.has(idCat) && !catsConservadas.has(idCat)) {
            const datos: any = {
              IdPlantillaFase: toVarchar(codigo),
              IdpptoFaseCategoria: toVarchar(cat.IdpptoFaseCategoria),
              id_categoria: idCategoria,
            };
            if (!catsConItems.has(idCat)) datos.CostoReferencial = costo;
            await orm.ppto_Plantillas_Categorias.where({ id: idCat }).update(datos);
            catsConservadas.add(idCat);
          } else {
            await orm.ppto_Plantillas_Categorias.create({
              IdPlantillaFase: toVarchar(codigo),
              IdpptoFaseCategoria: toVarchar(cat.IdpptoFaseCategoria),
              CostoReferencial: costo,
              id_categoria: idCategoria,
            } as any);
          }
        }
      }

      const catsABorrar = idsCats.filter((id) => !catsConservadas.has(id));
      if (catsABorrar.length) {
        await orm.ppto_Plantillas_Categorias.where((c: any) => c.id.in(catsABorrar)).deleteAndCount();
      }
      const fasesABorrar = codigosActuales.filter((c) => !fasesConservadas.has(c));
      if (fasesABorrar.length) {
        // Partidas que hubieran quedado colgando de esas fases (no deberían, pero por seguridad).
        await orm.ppto_Plantillas_Categorias.where((c: any) => c.IdPlantillaFase.in(fasesABorrar)).deleteAndCount();
        await orm.ppto_Plantillas_Fases.where((f: any) => f.IdPlantillaFase.in(fasesABorrar)).deleteAndCount();
      }
    });
    return { success: true };
  }

  async deletePlantilla(idPlantilla: string): Promise<{ success: boolean }> {
    const plantilla = await this.db.orm.public.ppto_Plantillas.first({ IdPlantilla: toVarchar(idPlantilla) });
    if (!plantilla) throw new NotFoundException('Plantilla no encontrada');
    await this.db.orm.public.ppto_Plantillas.where({ IdPlantilla: toVarchar(idPlantilla) }).delete();
    return { success: true };
  }

  private mapToResponse(p: any): PlantillaResponseDto {
    return {
      id: p.id,
      IdPlantilla: p.IdPlantilla as string,
      Nombre: p.Nombre as string,
      Descripcion: p.Descripcion as string | undefined,
      Activo: p.Activo,
      FechaCreacion: p.FechaCreacion?.toString() as string,
    };
  }

}
