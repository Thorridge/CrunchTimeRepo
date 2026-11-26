export type Vec = { x: number; y: number };

/** Pas de la grille d'aimantation, en centimètres. */
export const GRID = 10;

export const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

export const snapValue = (v: number, step = GRID) => Math.round(v / step) * step;

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Projette p sur le segment [a, b]. t = position relative (0 → a, 1 → b), d = distance à p. */
export function projectOnSegment(p: Vec, a: Vec, b: Vec) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { x: a.x, y: a.y, t: 0, d: distance(p, a) };
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
  const x = a.x + t * dx;
  const y = a.y + t * dy;
  return { x, y, t, d: distance(p, { x, y }) };
}

/** 345 → "3,45 m" */
export const formatLength = (cm: number) => `${(cm / 100).toFixed(2).replace('.', ',')} m`;

export function bounds(points: Vec[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}
