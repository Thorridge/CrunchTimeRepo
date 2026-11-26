import type { Plan, Project } from './store';
import { distance, projectOnSegment } from './geometry';
import { CATALOG, DEFAULT_FLOOR_COLOR, type FurnitureType } from './furniture';

/*
 * Modèles prédéfinis. Chaque plan est décrit simplement avec des tracés de murs
 * (listes de coordonnées en cm) ; les jonctions en T sont calculées automatiquement.
 */

let counter = 0;
const nextId = (prefix: string) => `${prefix}${(counter++).toString(36)}`;

type XY = [number, number];

class PlanBuilder {
  plan: Plan = { points: {}, walls: {}, doors: {}, stairs: {}, furniture: {}, floorColor: DEFAULT_FLOOR_COLOR };

  private point([x, y]: XY) {
    const found = Object.values(this.plan.points).find((p) => p.x === x && p.y === y);
    if (found) return found.id;
    const id = nextId('p');
    this.plan.points[id] = { id, x, y };
    return id;
  }

  /** Une suite de murs reliés : wall(30, [0,0], [100,0], [100,50]) */
  wall(thickness: number, ...path: XY[]) {
    for (let i = 0; i < path.length - 1; i++) {
      const id = nextId('w');
      // Les murs épais (≥ 25 cm) sont les murs porteurs / fondations.
      this.plan.walls[id] = { id, a: this.point(path[i]), b: this.point(path[i + 1]), thickness, structural: thickness >= 25 };
    }
    return this;
  }

  /** Rectangle fermé de murs. */
  rect(thickness: number, x1: number, y1: number, x2: number, y2: number) {
    return this.wall(thickness, [x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]);
  }

  /** Porte centrée en (x, y), qui doit tomber sur un mur. */
  door(x: number, y: number, width: number, flip = false, hingeAtEnd = false) {
    this.doors.push({ x, y, width, flip, hingeAtEnd, kind: 'door' });
    return this;
  }

  /** Fenêtre centrée en (x, y) sur un mur. */
  window(x: number, y: number, width: number, sill = 90, height = 125) {
    this.doors.push({ x, y, width, flip: false, hingeAtEnd: false, kind: 'window', sill, height });
    return this;
  }

  /** Meuble du catalogue, centré en (x, y). Rotation : 0 = l'avant regarde vers le bas de l'écran. */
  item(type: FurnitureType, x: number, y: number, rotation = 0, size?: { width?: number; depth?: number; color?: string }) {
    const id = nextId('f');
    const c = CATALOG[type];
    this.plan.furniture[id] = {
      id, type, x, y, rotation,
      width: size?.width ?? c.width,
      depth: size?.depth ?? c.depth,
      color: size?.color ?? c.color,
    };
    return this;
  }

  floor(color: string) {
    this.plan.floorColor = color;
    return this;
  }

  /** Escalier : centre (x, y), largeur, longueur, rotation (0 = monte vers le haut de l'écran). */
  stair(x: number, y: number, width: number, length: number, rotation = 0) {
    const id = nextId('s');
    this.plan.stairs[id] = { id, x, y, width, length, rotation };
    return this;
  }

  private doors: {
    x: number; y: number; width: number; flip: boolean; hingeAtEnd: boolean;
    kind: 'door' | 'window'; sill?: number; height?: number;
  }[] = [];

  build(): Plan {
    const { points, walls } = this.plan;
    // Coupe les murs sur lesquels un autre point est posé (jonctions en T).
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of Object.values(points)) {
        for (const w of Object.values(walls)) {
          if (w.a === p.id || w.b === p.id) continue;
          const pr = projectOnSegment(p, points[w.a], points[w.b]);
          if (pr.d < 0.5 && pr.t > 0 && pr.t < 1) {
            delete walls[w.id];
            const w1 = nextId('w');
            const w2 = nextId('w');
            walls[w1] = { ...w, id: w1, b: p.id };
            walls[w2] = { ...w, id: w2, a: p.id };
            changed = true;
            break;
          }
        }
      }
    }
    // Place les portes sur le mur qui passe par leur centre.
    for (const d of this.doors) {
      const wall = Object.values(walls).find((w) => projectOnSegment(d, points[w.a], points[w.b]).d < 0.5);
      if (!wall) continue;
      const id = nextId('d');
      this.plan.doors[id] = {
        id,
        wallId: wall.id,
        offset: distance(points[wall.a], d),
        width: d.width,
        flip: d.flip,
        hingeAtEnd: d.hingeAtEnd,
        kind: d.kind,
        ...(d.kind === 'window' ? { sill: d.sill, height: d.height } : {}),
      };
    }
    return this.plan;
  }
}

const project = (...levels: { name: string; plan: Plan }[]): Project => {
  const ids = levels.map(() => nextId('l'));
  return {
    levels: levels.map((l, i) => ({ id: ids[i], name: l.name })),
    activeLevelId: ids[0],
    data: Object.fromEntries(levels.map((l, i) => [ids[i], l.plan])),
  };
};

export type Template = { id: string; name: string; description: string; build: () => Project };

export const TEMPLATES: Template[] = [
  {
    id: 'maison',
    name: 'Maison',
    description: '10 × 8 m · 2 niveaux · 3 chambres · escalier · meublée',
    build: () =>
      project(
        {
          name: 'Rez-de-chaussée',
          plan: new PlanBuilder()
            .floor('#D9C2A3')
            .rect(30, 0, 0, 1000, 800)
            .wall(10, [600, 0], [600, 450], [1000, 450]) // bureau
            .wall(10, [0, 500], [250, 500], [250, 800]) // WC / buanderie
            .door(500, 800, 100) // entrée
            .door(600, 300, 80, true)
            .door(250, 650, 80)
            .window(300, 0, 180)
            .window(1000, 220, 120)
            .window(800, 800, 160)
            .window(0, 650, 60, 120, 80)
            .stair(100, 270, 100, 300, 0)
            // Cuisine + salle à manger
            .item('kitchen', 300, 45)
            .item('fridge', 452, 48)
            .item('table', 300, 280)
            .item('chair', 260, 212).item('chair', 340, 212)
            .item('chair', 260, 348, 180).item('chair', 340, 348, 180)
            // Salon
            .item('tv', 963, 625, 90)
            .item('sofa', 760, 625, 270)
            // Bureau
            .item('table', 800, 55, 0, { width: 140, depth: 70, color: '#F5F5F4' })
            .item('chair', 800, 120, 180)
            .build(),
        },
        {
          name: 'Étage 1',
          plan: new PlanBuilder()
            .floor('#C19A6B')
            .rect(30, 0, 0, 1000, 800)
            .wall(10, [500, 0], [500, 800])
            .wall(10, [500, 400], [1000, 400])
            .wall(10, [0, 500], [500, 500])
            .door(500, 200, 80, true)
            .door(500, 455, 80, true)
            .door(300, 500, 80)
            .window(250, 0, 100)
            .window(1000, 200, 120)
            .window(750, 800, 120)
            .window(0, 650, 80, 110, 90)
            .stair(100, 270, 100, 300, 0)
            .item('bed', 750, 115)
            .item('bed', 885, 600, 90, { width: 140, color: '#DCE3E8' })
            .build(),
        },
      ),
  },
  {
    id: 'loft',
    name: 'Loft',
    description: '14 × 9 m · espace ouvert · mezzanine · grandes baies',
    build: () =>
      project(
        {
          name: 'Rez-de-chaussée',
          plan: new PlanBuilder()
            .floor('#BFC5CC')
            .rect(30, 0, 0, 1400, 900)
            .wall(10, [1100, 0], [1100, 350], [1400, 350]) // salle de bain
            .door(1250, 350, 80, true)
            .door(300, 900, 110) // entrée
            .window(700, 0, 240, 20, 220)
            .window(950, 0, 180, 20, 220)
            .window(700, 900, 240, 20, 220)
            .window(0, 200, 150)
            .stair(85, 570, 90, 300, 0)
            .item('kitchen', 300, 45, 0, { width: 300, color: '#3F3F46' })
            .item('fridge', 485, 48)
            .item('table', 300, 270, 0, { width: 200, color: '#6B4F3A' })
            .item('chair', 240, 202).item('chair', 360, 202)
            .item('chair', 240, 338, 180).item('chair', 360, 338, 180)
            .item('tv', 1363, 620, 90)
            .item('sofa', 1130, 620, 270, { width: 240, color: '#B45F4D' })
            .build(),
        },
        {
          name: 'Mezzanine',
          plan: new PlanBuilder()
            .floor('#8B6A4E')
            .wall(30, [0, 400], [0, 0], [1400, 0], [1400, 400])
            .wall(5, [130, 400], [1400, 400]) // garde-corps
            .stair(85, 570, 90, 300, 0)
            .item('bed', 700, 115)
            .item('sofa', 1150, 100, 0, { width: 180, color: '#7C9070' })
            .build(),
        },
      ),
  },
  {
    id: 'appartement',
    name: 'Appartement T3',
    description: '11 × 8 m · 2 chambres · séjour · cuisine · meublé',
    build: () =>
      project({
        name: 'Appartement',
        plan: new PlanBuilder()
          .floor('#C19A6B')
          .rect(25, 0, 0, 1100, 800)
          .wall(10, [450, 0], [450, 800])
          .wall(10, [0, 400], [450, 400])
          .wall(10, [450, 500], [1100, 500])
          .wall(10, [750, 500], [750, 800])
          .door(1100, 250, 90) // entrée
          .door(450, 250, 80)
          .door(450, 450, 80)
          .door(600, 500, 80, true)
          .door(925, 500, 90, true)
          .window(225, 0, 120)
          .window(900, 0, 160)
          .window(0, 600, 120)
          .window(925, 800, 120)
          .window(600, 800, 60, 120, 80)
          .item('tv', 620, 35)
          .item('sofa', 620, 230, 180)
          .item('table', 980, 420)
          .item('chair', 940, 345).item('chair', 1020, 345)
          .item('kitchen', 925, 757, 180)
          .item('fridge', 1055, 560, 90)
          .item('bed', 112, 200, 270)
          .item('bed', 112, 600, 270, { width: 140, color: '#DCE3E8' })
          .build(),
      }),
  },
  {
    id: 'studio',
    name: 'Studio',
    description: '7 × 5 m · pièce unique · salle d’eau · meublé',
    build: () =>
      project({
        name: 'Studio',
        plan: new PlanBuilder()
          .floor('#D9C2A3')
          .rect(25, 0, 0, 700, 500)
          .wall(10, [250, 0], [250, 220], [0, 220])
          .door(125, 220, 70, true)
          .door(550, 500, 90)
          .window(700, 120, 100)
          .window(300, 500, 140)
          .window(0, 350, 100)
          .item('bed', 112, 380, 270, { width: 140 })
          .item('kitchen', 500, 42, 0)
          .item('fridge', 655, 45)
          .item('table', 330, 160, 0, { width: 90, depth: 80 })
          .item('chair', 330, 225, 180)
          .item('tv', 665, 300, 90, { width: 120 })
          .item('sofa', 470, 300, 270, { width: 180 })
          .build(),
      }),
  },
];
