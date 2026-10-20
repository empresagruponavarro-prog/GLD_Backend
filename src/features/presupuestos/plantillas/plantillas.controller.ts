import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { PlantillasHandler } from './plantillas.handler.js';
import { CreatePlantillaDto, UpdatePlantillaDto, UpsertPlantillaFaseDto, FusionarPlantillaDto } from './plantillas.dto.js';
import { LecturaCompartida, Modulo } from '../../../platform/auth/permisos.decorator.js';

@Controller('presupuestos')
@Modulo('presupuestos.plantillas')
export class PlantillasController {
  constructor(private readonly handler: PlantillasHandler) {}

  @LecturaCompartida()
  @Get('plantillas/activas')
  async listActivas() {
    return await this.handler.listActivas();
  }

  @Get('plantillas/todas')
  async listTodas() {
    return await this.handler.listTodas();
  }

  @LecturaCompartida()
  @Get('plantillas/:id/completa')
  async getCompleta(@Param('id') idPlantilla: string) {
    return await this.handler.getCompleta(idPlantilla);
  }

  @Post('plantillas')
  async createPlantilla(@Body() dto: CreatePlantillaDto) {
    return await this.handler.createPlantilla(dto);
  }

  @Put('plantillas/:id')
  async updatePlantilla(@Param('id') idPlantilla: string, @Body() dto: UpdatePlantillaDto) {
    return await this.handler.updatePlantilla(idPlantilla, dto);
  }

  @Put('plantillas/:id/fases')
  async updateFases(@Param('id') idPlantilla: string, @Body() fases: UpsertPlantillaFaseDto[]) {
    return await this.handler.updateFases(idPlantilla, fases);
  }

  @Post('plantillas/:id/fusionar')
  async fusionar(@Param('id') idPlantilla: string, @Body() dto: FusionarPlantillaDto) {
    return await this.handler.fusionar(idPlantilla, dto);
  }

  @Delete('plantillas/:id')
  async deletePlantilla(@Param('id') idPlantilla: string) {
    return await this.handler.deletePlantilla(idPlantilla);
  }

}
