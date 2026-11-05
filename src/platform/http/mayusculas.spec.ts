import { Body, CallHandler, Controller, ExecutionContext, Patch, Post } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import { of } from 'rxjs';
import { PATRON_CLAVES_EXCLUIDAS, PATRON_CODIGOS, aMayusculas, camposConValoresFijos } from './mayusculas.js';
import { MayusculasInterceptor, dtoDelCuerpo } from './mayusculas.interceptor.js';
import { SinMayusculas, SinMayusculasCampo } from './sin-mayusculas.decorator.js';

describe('platform/http / aMayusculas', () => {
  it('convierte los textos libres, también anidados y en listas', () => {
    const r = aMayusculas({ nombre: 'tienda norte', direccion: 'Av. Central 450', lineas: [{ descripcion: 'cemento', cantidad: '3' }], etiquetas: ['uno', 'dos'] });

    expect(r).toEqual({ nombre: 'TIENDA NORTE', direccion: 'AV. CENTRAL 450', lineas: [{ descripcion: 'CEMENTO', cantidad: '3' }], etiquetas: ['UNO', 'DOS'] });
  });

  it.each([
    ['correo', 'ana@gld.pe'],
    ['email', 'ana@gld.pe'],
    ['Usuario', 'e2e-admin'],
    ['clave', 'Abc123'],
    ['password', 'Abc123'],
    ['nueva_contrasena', 'Abc123'],
    ['foto_url', 'https://x.test/a.png'],
    ['google_maps_url', 'https://maps.test/q'],
    ['ruta', '/x/y'],
    ['oc_file', 'a.pdf'],
    ['nombre_archivo', 'plano.pdf'],
    ['observaciones', 'lo dijo en la reunión'],
    ['comentario', 'ok'],
    ['justificacion', 'reposición'],
    ['refresh_token', 'abc.def'],
    ['IdPresupuesto', 'ppto-2026-001'],
    ['IdOC', 'oc-1'],
    ['id_oc', 'oc-1'],
  ])('no toca la clave %s', (clave, valor) => {
    expect(aMayusculas({ [clave]: valor })).toEqual({ [clave]: valor });
  });

  it('una clave parecida a Id pero que no es un código sí se convierte', () => {
    expect(aMayusculas({ identificacion: 'abc', idioma: 'es' })).toEqual({ identificacion: 'ABC', idioma: 'ES' });
    expect(PATRON_CODIGOS.test('Idioma')).toBe(false);
    expect(PATRON_CLAVES_EXCLUIDAS.test('descripcion')).toBe(false);
  });

  it('no toca números, booleanos, nulos ni fechas, y no muta la entrada', () => {
    const fecha = new Date('2026-01-01T00:00:00Z');
    const entrada = { n: 1, ok: true, nada: null, f: fecha, texto: 'a' };
    const r = aMayusculas(entrada) as typeof entrada;

    expect(r).toEqual({ n: 1, ok: true, nada: null, f: fecha, texto: 'A' });
    expect(r.f).toBe(fecha);
    expect(entrada.texto).toBe('a');
  });

  it('un campo marcado con @SinMayusculasCampo() no se convierte', () => {
    class Dto {
      @SinMayusculasCampo() tipo_especial?: string;
    }
    void Dto;

    expect(aMayusculas({ tipo_especial: 'Principal', otro: 'Principal' })).toEqual({ tipo_especial: 'Principal', otro: 'PRINCIPAL' });
  });
});

describe('platform/http / campos de valores fijos (por DTO)', () => {
  class Linea {
    @IsOptional() @IsIn(['En Revisión', 'Aprobado']) estado_linea?: string;
    @IsString() descripcion_linea?: string;
  }
  class Cabecera {
    @IsOptional() @IsIn(['En Planta', 'De Baja']) estado_planta_prueba?: string;
    @IsOptional() @IsIn(['COMPRA', 'VENTA']) motivo_prueba?: string;
    @IsOptional() @IsString() texto_prueba?: string;
    @ValidateNested({ each: true }) @Type(() => Linea) lineas_prueba?: Linea[];
  }
  /** Mismo nombre de propiedad que en `Cabecera.direccion_prueba`, pero aquí es un orden fijo. */
  class Consulta {
    @IsOptional() @IsIn(['asc', 'desc']) direccion_prueba?: string;
  }
  class Domicilio {
    @IsOptional() @IsString() direccion_prueba?: string;
  }

  it('solo cuentan los @IsIn/@IsEnum con valores que cambiarían a mayúsculas', () => {
    expect([...camposConValoresFijos(Cabecera)]).toEqual(['estado_planta_prueba']);
    expect([...camposConValoresFijos(Linea)]).toEqual(['estado_linea']);
    expect(camposConValoresFijos(Domicilio).size).toBe(0);
  });

  it('respeta los campos fijos del DTO y de los DTO anidados', () => {
    const r = aMayusculas(
      { estado_planta_prueba: 'En Planta', motivo_prueba: 'compra', texto_prueba: 'hola', lineas_prueba: [{ estado_linea: 'En Revisión', descripcion_linea: 'cemento' }] },
      Cabecera,
    );

    expect(r).toEqual({ estado_planta_prueba: 'En Planta', motivo_prueba: 'COMPRA', texto_prueba: 'HOLA', lineas_prueba: [{ estado_linea: 'En Revisión', descripcion_linea: 'CEMENTO' }] });
  });

  it('el mismo nombre de campo se trata según el DTO de cada ruta (no hay confusión entre direcciones)', () => {
    expect(aMayusculas({ direccion_prueba: 'asc' }, Consulta)).toEqual({ direccion_prueba: 'asc' });
    expect(aMayusculas({ direccion_prueba: 'av. central' }, Domicilio)).toEqual({ direccion_prueba: 'AV. CENTRAL' });
    expect(aMayusculas({ direccion_prueba: 'av. central' })).toEqual({ direccion_prueba: 'AV. CENTRAL' });
  });
});

describe('platform/http / MayusculasInterceptor', () => {
  class CuerpoPrueba {
    @IsOptional() @IsIn(['En Planta', 'De Baja']) estado_interceptor?: string;
    @IsString() nombre_interceptor?: string;
  }

  @Controller('x')
  class Normal {
    @Post() crear(@Body() _dto: CuerpoPrueba) {}
    @Patch() editar(@Body() _dto: Record<string, unknown>) {}
  }
  @SinMayusculas()
  @Controller('y')
  class Excluido {
    @Post() crear(@Body() _dto: CuerpoPrueba) {}
  }
  @Controller('z')
  class ConMetodoExcluido {
    @SinMayusculas() @Post() crear(@Body() _dto: CuerpoPrueba) {}
    @Post() otro(@Body() _dto: CuerpoPrueba) {}
  }

  const ejecutar = (clase: new () => object, metodo: string, request: { method: string; body?: unknown }) => {
    const proto = clase.prototype as Record<string, () => void>;
    const contexto = {
      getType: () => 'http',
      getHandler: () => proto[metodo],
      getClass: () => clase,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const siguiente: CallHandler = { handle: () => of('ok') };
    new MayusculasInterceptor(new Reflector()).intercept(contexto, siguiente);
    return request;
  };

  it('resuelve el DTO del @Body() de la ruta', () => {
    expect(dtoDelCuerpo(Normal, 'crear')).toBe(CuerpoPrueba);
    expect(dtoDelCuerpo(Normal, 'editar')).toBeUndefined(); // un tipo suelto (Record) no es una clase
  });

  it('convierte el cuerpo de un POST antes de que lo vea el pipe de validación, respetando los campos fijos del DTO', () => {
    const r = ejecutar(Normal, 'crear', { method: 'POST', body: { nombre_interceptor: 'tienda', estado_interceptor: 'En Planta', correo: 'a@b.c' } });

    expect(r.body).toEqual({ nombre_interceptor: 'TIENDA', estado_interceptor: 'En Planta', correo: 'a@b.c' });
  });

  it('también PUT y PATCH; GET y DELETE no se tocan', () => {
    expect((ejecutar(Normal, 'editar', { method: 'PATCH', body: { n: 'a' } }).body as { n: string }).n).toBe('A');
    expect((ejecutar(Normal, 'editar', { method: 'PUT', body: { n: 'a' } }).body as { n: string }).n).toBe('A');
    expect((ejecutar(Normal, 'editar', { method: 'GET', body: { n: 'a' } }).body as { n: string }).n).toBe('a');
    expect((ejecutar(Normal, 'editar', { method: 'DELETE', body: { n: 'a' } }).body as { n: string }).n).toBe('a');
  });

  it('@SinMayusculas() en la clase o en el método excluye la ruta', () => {
    expect((ejecutar(Excluido, 'crear', { method: 'POST', body: { nombre_interceptor: 'Jefe de Área' } }).body as { nombre_interceptor: string }).nombre_interceptor).toBe('Jefe de Área');
    expect((ejecutar(ConMetodoExcluido, 'crear', { method: 'POST', body: { nombre_interceptor: 'Jefe' } }).body as { nombre_interceptor: string }).nombre_interceptor).toBe('Jefe');
    expect((ejecutar(ConMetodoExcluido, 'otro', { method: 'POST', body: { nombre_interceptor: 'Jefe' } }).body as { nombre_interceptor: string }).nombre_interceptor).toBe('JEFE');
  });

  it('sin cuerpo no falla', () => {
    expect(ejecutar(Normal, 'crear', { method: 'POST' }).body).toBeUndefined();
    expect(ejecutar(Normal, 'crear', { method: 'POST', body: null }).body).toBeNull();
  });
});
