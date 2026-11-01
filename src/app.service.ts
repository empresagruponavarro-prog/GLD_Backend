import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  //Hola esto es un cambio de prueba
  getHello(): string {
    return 'Hello World!';
  }
}
