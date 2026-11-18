import { ConflictException } from '@nestjs/common';
import { camposNoEditablesEnProvisional, exigirCamposDeCabecera, exigirNoProvisional } from './estado-documento.js';

describe('documentos de origen / estado PROVISIONAL', () => {
  it('exigirNoProvisional: solo un provisional devuelve 409', () => {
    expect(() => exigirNoProvisional('PROVISIONAL', 'anular el documento')).toThrow(ConflictException);
    expect(() => exigirNoProvisional('PROVISIONAL', 'anular el documento')).toThrow(/provisional/);
    expect(() => exigirNoProvisional('REGISTRADO', 'anular el documento')).not.toThrow();
    expect(() => exigirNoProvisional('ANULADO', 'anular el documento')).not.toThrow();
    expect(() => exigirNoProvisional(null, 'anular el documento')).not.toThrow();
  });

  it('camposNoEditables: ignora los indefinidos y deja pasar fecha, comentarios y PDF', () => {
    expect(camposNoEditablesEnProvisional({ fecha_emision: '2026-11-18', comentarios: 'x', oc_pdf: 'a.pdf', igv: undefined })).toEqual([]);
    expect(camposNoEditablesEnProvisional({ comentarios: 'x', igv: 10, detalles: [], id_anexo: 3 })).toEqual(['igv', 'detalles', 'id_anexo']);
  });

  it('exigirCamposDeCabecera: un provisional rechaza montos o detalle y nombra los campos', () => {
    expect(() => exigirCamposDeCabecera('PROVISIONAL', { comentarios: 'listo', fecha_emision: '2026-11-18' })).not.toThrow();
    expect(() => exigirCamposDeCabecera('PROVISIONAL', { detalles: [] })).toThrow(/detalles/);
    expect(() => exigirCamposDeCabecera('PROVISIONAL', { renta_4ta: 5 })).toThrow(ConflictException);
  });

  it('exigirCamposDeCabecera: un documento registrado no cambia de comportamiento', () => {
    expect(() => exigirCamposDeCabecera('REGISTRADO', { detalles: [], igv: 10 })).not.toThrow();
  });
});
