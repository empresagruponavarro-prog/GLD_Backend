import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { PlantillasHandler } from './plantillas.handler.js';
import { AplicarPlantillaDto, CreatePlantillaDto, UpdatePlantillaDto, UpsertPlantillaFaseDto } from './plantillas.dto.js';

@Controller('presupuestos')
export class PlantillasController {
  constructor(private readonly handler: PlantillasHandler) {}

  @Get('plantillas/activas')
  async listActivas() {
    return await this.handler.listActivas();
  }

  @Get('plantillas/todas')
  async listTodas() {
    return await this.handler.listTodas();
  }

  @Get('plantillas/:id/completa')
  async getCompleta(@Param('id') idPlantilla: string) {
    return await this.handler.getCompleta(idPlantilla);
  }

  @Post(':id/aplicar-plantilla')
  async aplicarPlantilla(@Param('id') idPresupuesto: string, @Body() dto: AplicarPlantillaDto) {
    return await this.handler.aplicarPlantilla(idPresupuesto, dto);
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

  @Delete('plantillas/:id')
  async deletePlantilla(@Param('id') idPlantilla: string) {
    return await this.handler.deletePlantilla(idPlantilla);
  }

}
