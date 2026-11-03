import { toVarchar } from '../../../platform/db/varchar-helpers.js';
import { armarDirectorio, type ContactoTrabajador, ROL_COMPLEMENTO_EQUIPO, type ResidenteRow } from './directorio.js';

type FilaPrueba = Partial<Omit<ResidenteRow, 'nombre_completo' | 'rol_obra' | 'telefono' | 'turno' | 'estado_planta'>> & {
  id: number;
  nombre_completo?: string;
  rol_obra?: string;
  telefono?: string;
  turno?: string;
  estado_planta?: string;
};

const fila = ({ nombre_completo = 'MANUAL', rol_obra = 'Supervisor', telefono, turno, estado_planta = 'En Planta', ...resto }: FilaPrueba): ResidenteRow => ({
  id_centro_costo: 10,
  id_anexo: null,
  especialidad: null,
  correo: null,
  foto_url: null,
  orden: 1,
  created_at: null,
  ...resto,
  nombre_completo: toVarchar<200>(nombre_completo),
  rol_obra: toVarchar<100>(rol_obra),
  telefono: telefono === undefined ? null : toVarchar<50>(telefono),
  turno: turno === undefined ? null : toVarchar<100>(turno),
  estado_planta: toVarchar<50>(estado_planta),
});

const contactos = new Map<number, ContactoTrabajador>([
  [7, { nombre: 'ANA RUIZ', telefono: '911111111', correo: 'ana@gld.pe' }],
  [8, { nombre: 'LUIS PAZ', telefono: null, correo: null }],
]);

describe('armarDirectorio', () => {
  it('el equipo de la ficha va primero, con su cargo y el contacto de Trabajadores; luego los agregados a mano', () => {
    const r = armarDirectorio({ id_jefe_proyecto: 7, id_residente: 8 }, contactos, [fila({ id: 1, nombre_completo: 'PEDRO', rol_obra: 'Supervisor' })]);
    expect(r.map((x) => [x.clave, x.origen, x.nombre_completo, x.rol_obra])).toEqual([
      ['equipo-7', 'equipo', 'ANA RUIZ', 'Jefe de proyecto'],
      ['equipo-8', 'equipo', 'LUIS PAZ', 'Residente'],
      ['res-1', 'directorio', 'PEDRO', 'Supervisor'],
    ]);
    expect(r[0]).toMatchObject({ id: null, telefono: '911111111', correo: 'ana@gld.pe', whatsapp_url: 'https://wa.me/51911111111' });
    expect(r[1]).toMatchObject({ telefono: undefined, correo: undefined, whatsapp_url: undefined });
  });

  it('una persona con dos roles es una sola tarjeta', () => {
    const r = armarDirectorio({ id_jefe_proyecto: 7, id_coordinador: 7 }, contactos, []);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ rol_obra: 'Jefe de proyecto · Coordinador', roles_equipo: ['jefe_proyecto', 'coordinador'] });
  });

  it('la fila del directorio de alguien del equipo solo aporta sus datos de obra, que tienen prioridad, y no se repite', () => {
    const propia = fila({ id: 5, id_anexo: 7, nombre_completo: 'ANA (A MANO)', rol_obra: 'Jefe de obra', telefono: '922222222', turno: 'Noche', estado_planta: 'Vacaciones' });
    const r = armarDirectorio({ id_jefe_proyecto: 7 }, contactos, [propia]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      id: 5,
      nombre_completo: 'ANA RUIZ',
      rol_obra: 'Jefe de proyecto',
      telefono: '922222222',
      telefono_obra: '922222222',
      telefono_trabajador: '911111111',
      correo: 'ana@gld.pe',
      turno: 'Noche',
      estado_planta: 'Vacaciones',
    });
  });

  it('si la persona sale de la ficha, su fila de datos de obra deja de mostrarse; una fila escrita a mano vuelve a verse', () => {
    const complemento = fila({ id: 5, id_anexo: 7, rol_obra: ROL_COMPLEMENTO_EQUIPO });
    const aMano = fila({ id: 6, id_anexo: 8, nombre_completo: 'LUIS PAZ', rol_obra: 'Residente IIEE' });
    const r = armarDirectorio({ id_jefe_proyecto: null }, contactos, [complemento, aMano]);
    expect(r.map((x) => x.clave)).toEqual(['res-6']);
  });

  it('sin ficha, el directorio es el de siempre', () => {
    const r = armarDirectorio(null, new Map(), [fila({ id: 1 }), fila({ id: 2, orden: 2 })]);
    expect(r.map((x) => x.clave)).toEqual(['res-1', 'res-2']);
  });
});
