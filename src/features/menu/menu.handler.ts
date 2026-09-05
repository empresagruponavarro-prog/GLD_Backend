import { Injectable } from '@nestjs/common';
import { MENU } from './menu.definition.js';
import { type MenuSection } from './menu.dto.js';

@Injectable()
export class MenuHandler {
  getByRole(rol?: string): MenuSection[] {
    return MENU.flatMap((section) => {
      if (rol && section.roles && !section.roles.includes(rol)) return [];
      const items = section.items
        .filter((item) => !rol || !item.roles || item.roles.includes(rol))
        .map((item) => ({
          key: item.key,
          label: item.label,
          path: item.path,
          icon: item.icon,
        }));
      if (items.length === 0) return [];
      return [{ key: section.key, label: section.label, icon: section.icon, items }];
    });
  }
}