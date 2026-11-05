// class-transformer no declara `exports` y su almacén de metadatos solo se puede leer por la ruta interna. Se reutilizan sus
// tipos para que el import tipado funcione (lo usa `platform/http/mayusculas.ts`).
declare module 'class-transformer/cjs/storage.js' {
  export { defaultMetadataStorage } from 'class-transformer/types/storage';
}
