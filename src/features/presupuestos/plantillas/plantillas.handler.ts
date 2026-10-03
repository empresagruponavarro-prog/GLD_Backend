import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import {
  PlantillaCompletaResponseDto,
  PlantillaResponseDto,
  CreatePlantillaDto,
  AplicarPlantillaDto,
} from './plantillas.dto.js';
import { toVarchar, toDecimalString } from '../presupuestos.helpers.js';

@Injectable()
export class PlantillasHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async listActivas(): Promise<PlantillaResponseDto[]> {
    const plantillas = await this.db.orm.public.ppto_Plantillas
      .where((p: any) => p.Activo.eq(true))
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
            return {
              id: cat.id,
              IdPlantillaFase: cat.IdPlantillaFase as string,
              IdpptoFaseCategoria: cat.IdpptoFaseCategoria as string,
              NombreCategoria: catMaestra?.Descripcion as string | undefined,
              CostoReferencial: cat.CostoReferencial ? Number(cat.CostoReferencial) : undefined,
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

  async aplicarPlantilla(idPresupuesto: string, dto: AplicarPlantillaDto): Promise<{ success: boolean; fasesAgregadas: number; categoriasAgregadas: number }> {
    const plantillaCompleta = await this.getCompleta(dto.IdPlantilla);
    
    let totalFases = 0;
    let totalCats = 0;

    for (const fase of plantillaCompleta.fases) {
      const idDetalleFase = `DF-${Date.now()}-${Math.floor(Math.random()*1000)}`;
      
      await this.db.orm.public.ppto_DetalleFases.create({
        IdPresupuestoDetalle: toVarchar(idDetalleFase),
        IdPresupuesto: toVarchar(idPresupuesto),
        IdpptoFase: toVarchar(fase.IdpptoFase),
        id_empresa: dto.id_empresa,
        CodCentroCtoPrincipal: toVarchar(dto.CodCentroCtoPrincipal),
        CodCentroCto: toVarchar(dto.CodCentroCto),
        id_centro_costo: dto.id_centro_costo,
        CostoDirecto: toDecimalString(0),
        Usuario: toVarchar('SISTEMA_PLANTILLA'),
        FechaCreacion: toVarchar(new Date().toString()),
      });
      totalFases++;

      for (const cat of fase.categorias) {
        const idDetalleCat = `DC-${Date.now()}-${Math.floor(Math.random()*1000)}`;
        
        await this.db.orm.public.ppto_DetalleFasesCate.create({
          IdPresupuestoDetalleCategoria: toVarchar(idDetalleCat),
          IdPresupuestoDetalle: toVarchar(idDetalleFase),
          IdPresupuesto: toVarchar(idPresupuesto),
          IdpptoFaseCategoria: toVarchar(cat.IdpptoFaseCategoria),
          id_empresa: dto.id_empresa,
          CodCentroCtoPrincipal: toVarchar(dto.CodCentroCtoPrincipal),
          CodCentroCto: toVarchar(dto.CodCentroCto),
          id_centro_costo: dto.id_centro_costo,
          CostoDirecto: cat.CostoReferencial ? toDecimalString(cat.CostoReferencial) : toDecimalString(0),
          Usuario: toVarchar('SISTEMA_PLANTILLA'),
          FechaCreacion: toVarchar(new Date().toString()),
        });
        totalCats++;
      }
    }

    return {
      success: true,
      fasesAgregadas: totalFases,
      categoriasAgregadas: totalCats,
    };
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

  async updateFases(idPlantilla: string, fases: any[]): Promise<{ success: boolean }> {
    // Para simplificar, en un mantenedor real podríamos borrar y recrear o hacer un sync completo
    
    // Primero, obtenemos las fases actuales para borrarlas
    const currentFases = await this.db.orm.public.ppto_Plantillas_Fases.where({ IdPlantilla: toVarchar(idPlantilla) }).all();
    for (const cf of currentFases) {
      await this.db.orm.public.ppto_Plantillas_Categorias.where({ IdPlantillaFase: cf.IdPlantillaFase }).delete();
    }
    await this.db.orm.public.ppto_Plantillas_Fases.where({ IdPlantilla: toVarchar(idPlantilla) }).delete();
    
    for (let i = 0; i < fases.length; i++) {
      const f = fases[i];
      const IdPlantillaFase = f.IdPlantillaFase || `TPLF-${Date.now()}-${i}`;
      await this.db.orm.public.ppto_Plantillas_Fases.create({
        IdPlantillaFase: toVarchar(IdPlantillaFase),
        IdPlantilla: toVarchar(idPlantilla),
        IdpptoFase: toVarchar(f.IdpptoFase),
        Orden: f.Orden ?? i
      });

      if (f.categorias && f.categorias.length > 0) {
        for (const cat of f.categorias) {
          await this.db.orm.public.ppto_Plantillas_Categorias.create({
            IdPlantillaFase: toVarchar(IdPlantillaFase),
            IdpptoFaseCategoria: toVarchar(cat.IdpptoFaseCategoria),
            CostoReferencial: cat.CostoReferencial ? toDecimalString(cat.CostoReferencial) : undefined
          });
        }
      }
    }
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
