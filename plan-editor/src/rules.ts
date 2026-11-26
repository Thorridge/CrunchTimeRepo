import type { Plan } from './store';
import { GRID, clamp, distance, projectOnSegment, type Vec } from './geometry';

/*
 * Règles de construction :
 *  - les murs porteurs (fondations) sont verrouillés : ni déplacés, ni redimensionnés, ni supprimés ;
 *  - une cloison accrochée au milieu d'un mur glisse le long de ce mur au lieu de le déformer ;
 *  - les cloisons restent à l'intérieur du périmètre formé par les murs porteurs.
 */

type PlanLike = Pick<Plan, 'points' | 'walls'>;

/**
 * Si le point est une jonction en T (relié à au moins deux autres murs alignés de part
 * et d'autre), renvoie l'axe le long duquel il peut glisser et les bornes à ne pas dépasser.
 */
export function getSlideAxis(plan: PlanLike, pointId: string, excludeWallId: string) {
  const P = plan.points[pointId];
  const others = Object.values(plan.walls).filter(
    (w) => w.id !== excludeWallId && (w.a === pointId || w.b === pointId),
  );
  if (others.length < 2) return null;

  const ends = others.map((w) => plan.points[w.a === pointId ? w.b : w.a]);
  const len = distance(P, ends[0]);
  if (len === 0) return null;
  const dir = { x: (ends[0].x - P.x) / len, y: (ends[0].y - P.y) / len };

  const ts: number[] = [];
  for (const Q of ends) {
    const v = { x: Q.x - P.x, y: Q.y - P.y };
    const l = Math.hypot(v.x, v.y);
    if (l === 0 || Math.abs((dir.x * v.y - dir.y * v.x) / l) > 0.01) return null; // pas aligné
    ts.push(dir.x * v.x + dir.y * v.y);
  }
  const min = Math.min(...ts);
  const max = Math.max(...ts);
  if (min >= 0 || max <= 0) return null; // tous du même côté : c'est un coin, pas un T
  return { dir, min, max };
}

export type PointConstraint =
  | { kind: 'free' }
  | { kind: 'locked' }
  | { kind: 'slide'; axis: NonNullable<ReturnType<typeof getSlideAxis>> };

const structuralOnly = (plan: PlanLike): PlanLike => ({
  points: plan.points,
  walls: Object.fromEntries(Object.entries(plan.walls).filter(([, w]) => w.structural)),
});

export const isStructuralPoint = (plan: PlanLike, id: string) =>
  Object.values(plan.walls).some((w) => w.structural && (w.a === id || w.b === id));

/**
 * Comment un point peut bouger :
 *  - posé sur un mur porteur : il glisse le long, ou est bloqué s'il en est un coin ;
 *  - sinon, quand on déplace le mur `excludeWallId`, il glisse le long d'un T éventuel ;
 *  - sinon il est libre.
 */
export function pointConstraint(plan: PlanLike, pointId: string, excludeWallId?: string): PointConstraint {
  if (isStructuralPoint(plan, pointId)) {
    const axis = getSlideAxis(structuralOnly(plan), pointId, '');
    return axis ? { kind: 'slide', axis } : { kind: 'locked' };
  }
  const axis = excludeWallId ? getSlideAxis(plan, pointId, excludeWallId) : null;
  return axis ? { kind: 'slide', axis } : { kind: 'free' };
}

/** Applique un déplacement `d` à un point, selon sa contrainte. */
export function constrainedMove(origin: Vec, d: Vec, c: PointConstraint): Vec {
  if (c.kind === 'locked') return { ...origin };
  if (c.kind === 'free') return { x: origin.x + d.x, y: origin.y + d.y };
  const { dir, min, max } = c.axis;
  const t = clamp(d.x * dir.x + d.y * dir.y, min + SLIDE_MARGIN, max - SLIDE_MARGIN);
  return { x: origin.x + dir.x * t, y: origin.y + dir.y * t };
}

/** Distance minimale entre une cloison qui glisse et le bout du mur qui la porte. */
const SLIDE_MARGIN = 20;

/**
 * Réduit le déplacement d'un mur pour que ses extrémités s'arrêtent ensemble :
 * dès qu'une extrémité qui glisse arrive en butée, tout le mur s'arrête.
 */
export function limitDelta(d: Vec, constraints: PointConstraint[]): Vec {
  let m = { ...d };
  for (const c of constraints) {
    if (c.kind === 'locked') return { x: 0, y: 0 };
    if (c.kind !== 'slide') continue;
    const { dir, min, max } = c.axis;
    const t = m.x * dir.x + m.y * dir.y;
    const tc = clamp(t, min + SLIDE_MARGIN, max - SLIDE_MARGIN);
    m = { x: m.x + dir.x * (tc - t), y: m.y + dir.y * (tc - t) };
  }
  return m;
}

/* ---------- Périmètre des murs porteurs ---------- */

export type Perimeter = [Vec, Vec][];

/** Segments du contour porteur, ou null s'il n'est pas fermé (pas de contrainte alors). */
export function getPerimeter(plan: PlanLike): Perimeter | null {
  const walls = Object.values(plan.walls).filter((w) => w.structural);
  if (walls.length < 3) return null;
  const degree = new Map<string, number>();
  for (const w of walls) {
    degree.set(w.a, (degree.get(w.a) ?? 0) + 1);
    degree.set(w.b, (degree.get(w.b) ?? 0) + 1);
  }
  for (const d of degree.values()) if (d < 2) return null; // contour ouvert
  return walls.map((w) => [plan.points[w.a], plan.points[w.b]]);
}

/** Vrai si p est à l'intérieur du contour (ou posé dessus). */
export function insidePerimeter(per: Perimeter, p: Vec): boolean {
  let inside = false;
  for (const [a, b] of per) {
    if (projectOnSegment(p, a, b).d < 1) return true;
    if (a.y > p.y !== b.y > p.y) {
      const x = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
      if (p.x < x) inside = !inside;
    }
  }
  return inside;
}

/** Point du contour le plus proche de p. */
export function nearestOnPerimeter(per: Perimeter, p: Vec): Vec {
  let best = p;
  let bestD = Infinity;
  for (const [a, b] of per) {
    const pr = projectOnSegment(p, a, b);
    if (pr.d < bestD) {
      bestD = pr.d;
      best = { x: pr.x, y: pr.y };
    }
  }
  return best;
}

/** Ramène p dans le contour s'il en sort. */
export const keepInside = (per: Perimeter | null, p: Vec) =>
  !per || insidePerimeter(per, p) ? p : nearestOnPerimeter(per, p);

/**
 * Déplacement d'un mur : renvoie le plus grand déplacement (≤ d, aligné sur la grille)
 * qui garde ses deux extrémités dans le contour.
 */
export function fitWallMove(
  per: Perimeter | null,
  move: (d: Vec) => { a: Vec; b: Vec },
  d: Vec,
): { a: Vec; b: Vec } {
  const ok = (r: { a: Vec; b: Vec }) => !per || (insidePerimeter(per, r.a) && insidePerimeter(per, r.b));
  const full = move(d);
  if (ok(full)) return full;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (ok(move({ x: d.x * mid, y: d.y * mid }))) lo = mid;
    else hi = mid;
  }
  const toZero = (v: number) => Math.trunc(v / GRID) * GRID;
  const snapped = move({ x: toZero(d.x * lo), y: toZero(d.y * lo) });
  return ok(snapped) ? snapped : move({ x: 0, y: 0 });
}

/**
 * Contour du sol, dans l'ordre : on suit les murs porteurs de proche en proche.
 * Si le contour n'est pas fermé (ex. mezzanine), on prend le rectangle englobant.
 */
export function floorOutline(plan: PlanLike): Vec[] | null {
  const walls = Object.values(plan.walls).filter((w) => w.structural);
  const adj = new Map<string, string[]>();
  for (const w of walls) {
    adj.set(w.a, [...(adj.get(w.a) ?? []), w.b]);
    adj.set(w.b, [...(adj.get(w.b) ?? []), w.a]);
  }
  const closed = walls.length >= 3 && [...adj.values()].every((n) => n.length === 2);
  if (closed) {
    const start = walls[0].a;
    const loop = [start];
    let prev = start;
    let cur = adj.get(start)![0];
    while (cur !== start && loop.length <= walls.length) {
      loop.push(cur);
      const next = adj.get(cur)!.find((n) => n !== prev)!;
      prev = cur;
      cur = next;
    }
    if (cur === start) return loop.map((id) => plan.points[id]);
  }
  const pts = Object.values(plan.points);
  if (pts.length < 2) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
}
