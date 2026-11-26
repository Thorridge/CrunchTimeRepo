/*
 * Catalogue de mobilier. Dimensions en cm : `width` le long de l'axe local x,
 * `depth` le long de l'axe local y (l'avant du meuble est du côté +y), `height` en 3D.
 */
export type FurnitureType = 'kitchen' | 'fridge' | 'table' | 'chair' | 'sofa' | 'tv' | 'bed';

export type Furniture = {
  id: string;
  type: FurnitureType;
  /** Centre du meuble. */
  x: number;
  y: number;
  width: number;
  depth: number;
  rotation: number;
  color: string;
};

export type CatalogItem = {
  label: string;
  width: number;
  depth: number;
  height: number;
  color: string;
  /** Petite icône SVG (path, viewBox 24×24) pour la palette. */
  icon: string;
};

export const CATALOG: Record<FurnitureType, CatalogItem> = {
  kitchen: {
    label: 'Cuisine',
    width: 240, depth: 60, height: 90, color: '#F5F5F4',
    icon: 'M3 8h18v10H3zM3 12h18M8 8v10M15 8v10M10 5h4',
  },
  fridge: {
    label: 'Frigo',
    width: 60, depth: 65, height: 185, color: '#E5E7EB',
    icon: 'M7 3h10v18H7zM7 10h10M9 6v2M9 13v3',
  },
  table: {
    label: 'Table',
    width: 160, depth: 90, height: 75, color: '#A47551',
    icon: 'M3 9h18M5 9v9M19 9v9M3 9l2-3h14l2 3',
  },
  chair: {
    label: 'Chaise',
    width: 45, depth: 50, height: 85, color: '#475569',
    icon: 'M7 4v16M7 12h10v8M7 12V4',
  },
  sofa: {
    label: 'Canapé',
    width: 210, depth: 90, height: 80, color: '#64748B',
    icon: 'M4 11V8a2 2 0 012-2h12a2 2 0 012 2v3M2 11h20v6H2zM5 17v2M19 17v2',
  },
  tv: {
    label: 'Meuble TV',
    width: 160, depth: 45, height: 50, color: '#3F3F46',
    icon: 'M3 5h18v11H3zM8 20h8M12 16v4',
  },
  bed: {
    label: 'Lit double',
    width: 160, depth: 200, height: 50, color: '#E2E8F0',
    icon: 'M3 18V8M3 13h18v5M21 18v-5M6 13v-2a1 1 0 011-1h3a1 1 0 011 1v2',
  },
};

export const FURNITURE_TYPES = Object.keys(CATALOG) as FurnitureType[];

/** Palette de couleurs proposée pour les murs, sols et meubles. */
export const WALL_COLORS = ['#FAF9F6', '#F3EDE2', '#E8E4DC', '#DCE3E8', '#E3EBDD', '#F4E1D6', '#D6D3CE', '#3F4A5A'];
export const FLOOR_COLORS = ['#D9C2A3', '#C19A6B', '#8B6A4E', '#E7E5E4', '#BFC5CC', '#9CA3AF', '#F1EDE4', '#5C4B3E'];
export const FURNITURE_COLORS = ['#F5F5F4', '#E5E7EB', '#A47551', '#6B4F3A', '#475569', '#64748B', '#1F2937', '#7C9070', '#B45F4D', '#2E5E8C'];

export const FLOOR_LABELS: Record<string, string> = {
  '#D9C2A3': 'Chêne clair',
  '#C19A6B': 'Chêne doré',
  '#8B6A4E': 'Noyer',
  '#E7E5E4': 'Carrelage blanc',
  '#BFC5CC': 'Béton ciré',
  '#9CA3AF': 'Ardoise',
  '#F1EDE4': 'Pierre claire',
  '#5C4B3E': 'Wengé',
};

export const DEFAULT_FLOOR_COLOR = '#D9C2A3';
export const DEFAULT_WALL_COLOR = '#FAF9F6';
