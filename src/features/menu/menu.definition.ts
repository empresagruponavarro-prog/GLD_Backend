export const ROLES = ['ADMIN', 'ALMACEN', 'VENTAS'] as const;

export type MenuItemDef = {
  key: string;
  label: string;
  path: string;
  icon?: string;
  roles?: string[];
};

export type MenuSectionDef = {
  key: string;
  label: string;
  icon?: string;
  roles?: string[];
  items: MenuItemDef[];
};

export const MENU: MenuSectionDef[] = [
  {
    key: 'maestros',
    label: 'Maestros',
    icon: 'inventory_2',
    roles: ['ADMIN', 'ALMACEN', 'VENTAS'],
    items: [
      {
        key: 'tipo-categoria',
        label: 'Tipos de categoría',
        path: '/maestros/tipo-categoria',
        icon: 'category',
        roles: ['ADMIN'],
      },
      {
        key: 'categoria',
        label: 'Categorías',
        path: '/maestros/categoria',
        icon: 'folder',
        roles: ['ADMIN', 'ALMACEN'],
      },
      {
        key: 'unidad-medida',
        label: 'Unidades de medida',
        path: '/maestros/unidad-medida',
        icon: 'straighten',
        roles: ['ADMIN', 'ALMACEN'],
      },
      {
        key: 'producto',
        label: 'Productos',
        path: '/maestros/producto',
        icon: 'inventory',
        roles: ['ADMIN', 'ALMACEN', 'VENTAS'],
      },
    ],
  },
];