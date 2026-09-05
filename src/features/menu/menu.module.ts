import { Module } from '@nestjs/common';
import { MenuController } from './menu.controller.js';
import { MenuHandler } from './menu.handler.js';

@Module({
  controllers: [MenuController],
  providers: [MenuHandler],
})
export class MenuModule {}