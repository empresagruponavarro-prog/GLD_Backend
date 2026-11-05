import { toVarchar } from '../../../platform/db/varchar-helpers.js';
import { armarDirectorio, armarHistorial, planificarCambiosEquipo, type ContactoTrabajador, ROL_COMPLEMENTO_EQUIPO, type ResidenteRow } from './directorio.js';

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
  rol_equipo: null,
  activo: true,
  fecha_alta: null,
  fecha_baja: null,
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
      ['equipo-7-jefe_proyecto', 'equipo', 'ANA RUIZ', 'Jefe de proyecto'],
      ['equipo-8-residente', 'equipo', 'LUIS PAZ', 'Residente'],
      ['res-1', 'directorio', 'PEDRO', 'Supervisor'],
    ]);
    expect(r[0]).toMatchObject({ id: null, telefono: '911111111', correo: 'ana@gld.pe', whatsapp_url: 'https://wa.me/51911111111' });
    expect(r[1]).toMatchObject({ telefono: undefined, correo: undefined, whatsapp_url: undefined });
  });

  it('S-06 · una persona con dos roles aparece dos veces, con los mismos datos de contacto', () => {
    const r = armarDirectorio({ id_jefe_proyecto: 7, id_coordinador: 7 }, contactos, []);
    expect(r).toHaveLength(2);
    expect(r.map((x) => [x.clave, x.rol_obra, x.roles_equipo])).toEqual([
      ['equipo-7-jefe_proyecto', 'Jefe de proyecto', ['jefe_proyecto']],
      ['equipo-7-coordinador', 'Coordinador', ['coordinador']],
    ]);
    expect(r.every((x) => x.nombre_completo === 'ANA RUIZ' && x.telefono === '911111111')).toBe(true);
  });

  it('los datos de obra de la persona valen para todas sus tarjetas', () => {
    const propia = fila({ id: 5, id_anexo: 7, rol_obra: ROL_COMPLEMENTO_EQUIPO, turno: 'Noche' });
    const r = armarDirectorio({ id_jefe_proyecto: 7, id_coordinador: 7 }, contactos, [propia]);
    expect(r.map((x) => [x.id, x.turno])).toEqual([[5, 'Noche'], [5, 'Noche']]);
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

describe('registros de alta y baja del equipo (S-06)', () => {
  const registro = (extra: Partial<ResidenteRow> & { id: number }) => fila({ rol_obra: 'Residente', ...extra });

  it('un registro de alta no es un contacto ni datos de obra: solo aporta el «desde» de la tarjeta', () => {
    const alta = registro({ id: 9, id_anexo: 8, rol_equipo: toVarchar<30>('residente'), activo: true, fecha_alta: new Date('2026-10-05T00:00:00Z') as unknown as ResidenteRow['fecha_alta'] });
    const r = armarDirectorio({ id_residente: 8 }, contactos, [alta]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ clave: 'equipo-8-residente', id: null, fecha_alta: '2026-10-05' });
  });

  it('los registros de baja no salen en el directorio', () => {
    const baja = registro({ id: 10, id_anexo: 8, rol_equipo: toVarchar<30>('residente'), activo: false });
    expect(armarDirectorio(null, new Map(), [baja])).toEqual([]);
  });

  it('el historial lista solo las bajas, de la más reciente a la más antigua', () => {
    const f = (id: number, baja: string, extra: Partial<ResidenteRow> = {}) =>
      registro({ id, id_anexo: 8, rol_equipo: toVarchar<30>('residente'), activo: false, fecha_baja: new Date(`${baja}T00:00:00Z`) as unknown as ResidenteRow['fecha_baja'], ...extra });
    const h = armarHistorial([
      f(1, '2026-09-01'),
      f(2, '2026-10-20', { nombre_completo: toVarchar<200>('LUIS PAZ') }),
      registro({ id: 3, id_anexo: 7, rol_equipo: toVarchar<30>('jefe_proyecto'), activo: true }), // vigente: no es historial
      fila({ id: 4, nombre_completo: 'A MANO' }), // contacto a mano: no es historial
    ]);
    expect(h.map((x) => [x.clave, x.origen, x.fecha_baja])).toEqual([
      ['hist-2', 'historial', '2026-10-20'],
      ['hist-1', 'historial', '2026-09-01'],
    ]);
    expect(h[0].nombre_completo).toBe('LUIS PAZ');
  });
});

describe('planificarCambiosEquipo', () => {
  it('sin cambios no hay nada que registrar', () => {
    expect(planificarCambiosEquipo({ id_jefe_proyecto: 7 }, { id_jefe_proyecto: 7 })).toEqual({ cerrar: [], abrir: [] });
    expect(planificarCambiosEquipo(null, null)).toEqual({ cerrar: [], abrir: [] });
  });

  it('una ficha nueva da de alta a todo el equipo', () => {
    expect(planificarCambiosEquipo(null, { id_jefe_proyecto: 7, id_residente: 8 })).toEqual({
      cerrar: [],
      abrir: [
        { rol: 'jefe_proyecto', idAnexo: 7 },
        { rol: 'residente', idAnexo: 8 },
      ],
    });
  });

  it('cambiar al residente da de baja al anterior y de alta al nuevo, sin tocar los demás roles', () => {
    expect(planificarCambiosEquipo({ id_jefe_proyecto: 7, id_residente: 8 }, { id_jefe_proyecto: 7, id_residente: 9 })).toEqual({
      cerrar: [{ rol: 'residente', idAnexo: 8 }],
      abrir: [{ rol: 'residente', idAnexo: 9 }],
    });
  });

  it('quitar un rol solo da de baja; la persona con dos roles conserva el otro', () => {
    expect(planificarCambiosEquipo({ id_jefe_proyecto: 7, id_coordinador: 7 }, { id_jefe_proyecto: 7, id_coordinador: null })).toEqual({
      cerrar: [{ rol: 'coordinador', idAnexo: 7 }],
      abrir: [],
    });
  });
});
