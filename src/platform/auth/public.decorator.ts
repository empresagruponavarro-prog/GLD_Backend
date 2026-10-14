import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/** Marca una ruta (o controller) como accesible sin token. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
