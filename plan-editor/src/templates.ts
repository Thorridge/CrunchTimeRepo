import type { Plan, Project } from './store';
import { distance, projectOnSegment } from './geometry';

/*
 * Modèles prédéfinis. Chaque plan est décrit simplement avec des tracés de murs
 * (listes de coordonnées en cm) ; les jonctions en T sont calculées automatiquement.
 */

let counter = 0;
const nextId = (prefix: string) => `${prefix}${(counter++).toString(36)}`;

type XY = [number, number];

class PlanBuilder {
  plan: Plan = { points: {}, walls: {}, doors: {}, stairs: {} };

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
      this.plan.walls[id] = { id, a: this.point(path[i]), b: this.point(path[i + 1]), thickness };
    }
    return this;
  }

  /** Rectangle fermé de murs. */
  rect(thickness: number, x1: number, y1: number, x2: number, y2: number) {
    return this.wall(thickness, [x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]);
  }

  /** Porte centrée en (x, y), qui doit tomber sur un mur. */
  door(x: number, y: number, width: number, flip = false, hingeAtEnd = false) {
    this.doors.push({ x, y, width, flip, hingeAtEnd });
    return this;
  }

  /** Escalier : centre (x, y), largeur, longueur, rotation (0 = monte vers le haut de l'écran). */
  stair(x: number, y: number, width: number, length: number, rotation = 0) {
    const id = nextId('s');
    this.plan.stairs[id] = { id, x, y, width, length, rotation };
    return this;
  }

  private doors: { x: number; y: number; width: number; flip: boolean; hingeAtEnd: boolean }[] = [];

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
            walls[w1] = { id: w1, a: w.a, b: p.id, thickness: w.thickness };
            walls[w2] = { id: w2, a: p.id, b: w.b, thickness: w.thickness };
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
    description: '10 × 8 m · 2 niveaux · 3 chambres · escalier',
    build: () =>
      project(
        {
          name: 'Rez-de-chaussée',
          plan: new PlanBuilder()
            .rect(30, 0, 0, 1000, 800)
            .wall(10, [600, 0], [600, 450], [1000, 450]) // bureau
            .wall(10, [0, 500], [250, 500], [250, 800]) // WC / buanderie
            .door(500, 800, 100) // entrée
            .door(600, 300, 80, true)
            .door(250, 650, 80)
            .door(300, 0, 120) // baie vers le jardin
            .stair(100, 270, 100, 300, 0)
            .build(),
        },
        {
          name: 'Étage 1',
          plan: new PlanBuilder()
            .rect(30, 0, 0, 1000, 800)
            .wall(10, [500, 0], [500, 800])
            .wall(10, [500, 400], [1000, 400])
            .wall(10, [0, 500], [500, 500])
            .door(500, 200, 80, true)
            .door(500, 455, 80, true)
            .door(300, 500, 80)
            .stair(100, 270, 100, 300, 0)
            .build(),
        },
      ),
  },
  {
    id: 'loft',
    name: 'Loft',
    description: '14 × 9 m · espace ouvert · mezzanine',
    build: () =>
      project(
        {
          name: 'Rez-de-chaussée',
          plan: new PlanBuilder()
            .rect(30, 0, 0, 1400, 900)
            .wall(10, [1100, 0], [1100, 350], [1400, 350]) // salle de bain
            .door(1250, 350, 80, true)
            .door(300, 900, 110) // entrée
            .stair(85, 570, 90, 300, 0)
            .build(),
        },
        {
          name: 'Mezzanine',
          plan: new PlanBuilder()
            .wall(30, [0, 400], [0, 0], [1400, 0], [1400, 400])
            .wall(5, [130, 400], [1400, 400]) // garde-corps
            .stair(85, 570, 90, 300, 0)
            .build(),
        },
      ),
  },
  {
    id: 'appartement',
    name: 'Appartement T3',
    description: '11 × 8 m · 2 chambres · séjour · cuisine',
    build: () =>
      project({
        name: 'Appartement',
        plan: new PlanBuilder()
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
          .build(),
      }),
  },
  {
    id: 'studio',
    name: 'Studio',
    description: '7 × 5 m · pièce unique · salle d’eau',
    build: () =>
      project({
        name: 'Studio',
        plan: new PlanBuilder()
          .rect(25, 0, 0, 700, 500)
          .wall(10, [250, 0], [250, 220], [0, 220])
          .door(125, 220, 70, true)
          .door(550, 500, 90)
          .build(),
      }),
  },
];
