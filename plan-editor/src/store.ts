import { create } from 'zustand';
import { clamp, distance, projectOnSegment, type Vec } from './geometry';
import { TEMPLATES } from './templates';

/*
 * Un projet contient plusieurs niveaux (RDC, étages…). Chaque niveau est un plan.
 * Un plan est un graphe : des points (coins) reliés par des murs.
 * Déplacer un point déplace automatiquement tous les murs qui y sont attachés.
 * Les portes sont posées sur un mur, à une distance `offset` du point `a` du mur.
 * Toutes les distances sont en centimètres.
 */
export type Point = { id: string; x: number; y: number };
export type Wall = { id: string; a: string; b: string; thickness: number };
export type Door = {
  id: string;
  wallId: string;
  /** Distance entre le point `a` du mur et le centre de la porte. */
  offset: number;
  width: number;
  /** Côté du mur vers lequel la porte s'ouvre. */
  flip: boolean;
  /** Gonds du côté du point `a` (false) ou du point `b` (true). */
  hingeAtEnd: boolean;
};
/** Escalier droit. (x, y) = centre ; il monte vers le « haut » local, tourné de `rotation` degrés. */
export type Stair = { id: string; x: number; y: number; width: number; length: number; rotation: number };
export type Plan = {
  points: Record<string, Point>;
  walls: Record<string, Wall>;
  doors: Record<string, Door>;
  stairs: Record<string, Stair>;
};
export type LevelInfo = { id: string; name: string };
export type Project = { levels: LevelInfo[]; activeLevelId: string; data: Record<string, Plan> };

export type Selection = { kind: 'wall' | 'point' | 'door' | 'stair'; id: string } | null;
export type Tool = 'select' | 'wall' | 'door' | 'stair';
/** Une position cible : un point existant, un point sur un mur existant, ou une position libre. */
export type Anchor = Vec & { pointId?: string; onWallId?: string };

const STORAGE_KEY = 'tp-plan-editor:v2';
const LEGACY_STORAGE_KEY = 'tp-plan-editor:v1';
const HISTORY_LIMIT = 100;
const EPS = 0.5;
export const DEFAULT_DOOR_WIDTH = 90;

export const uid = () => Math.random().toString(36).slice(2, 10);
export const emptyPlan = (): Plan => ({ points: {}, walls: {}, doors: {}, stairs: {} });

/* ---------- Validation / chargement ---------- */

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

function parsePlan(v: unknown): Plan | null {
  if (!isObj(v) || !isObj(v.points) || !isObj(v.walls)) return null;
  const points = v.points as Plan['points'];
  const walls = v.walls as Plan['walls'];
  const doors = (isObj(v.doors) ? v.doors : {}) as Plan['doors'];
  const stairs = (isObj(v.stairs) ? v.stairs : {}) as Plan['stairs'];
  const ok =
    Object.values(points).every((p) => isObj(p) && Number.isFinite(p.x) && Number.isFinite(p.y)) &&
    Object.values(walls).every((w) => isObj(w) && points[w.a] && points[w.b] && Number.isFinite(w.thickness)) &&
    Object.values(doors).every((d) => isObj(d) && walls[d.wallId] && Number.isFinite(d.offset) && Number.isFinite(d.width)) &&
    Object.values(stairs).every((s) => isObj(s) && [s.x, s.y, s.width, s.length, s.rotation].every(Number.isFinite));
  return ok ? { points, walls, doors, stairs } : null;
}

/** Accepte un projet multi-niveaux, ou un ancien plan à un seul niveau. */
export function parseProject(v: unknown): Project | null {
  if (isObj(v) && Array.isArray(v.levels) && isObj(v.data)) {
    const levels = v.levels as LevelInfo[];
    const data: Record<string, Plan> = {};
    for (const l of levels) {
      const plan = parsePlan((v.data as Record<string, unknown>)[l?.id]);
      if (!plan || typeof l.name !== 'string') return null;
      data[l.id] = plan;
    }
    if (levels.length === 0) return null;
    const active = levels.some((l) => l.id === v.activeLevelId) ? (v.activeLevelId as string) : levels[0].id;
    return { levels, activeLevelId: active, data };
  }
  const plan = parsePlan(v);
  if (!plan) return null;
  return { levels: [{ id: 'l0', name: 'Rez-de-chaussée' }], activeLevelId: 'l0', data: { l0: plan } };
}

function loadInitial(): Project {
  for (const key of [STORAGE_KEY, LEGACY_STORAGE_KEY]) {
    try {
      const raw = localStorage.getItem(key);
      const project = raw ? parseProject(JSON.parse(raw)) : null;
      if (project) return project;
    } catch {
      // stockage indisponible ou illisible
    }
  }
  return TEMPLATES[0].build();
}

/* ---------- Opérations pures sur une copie du plan actif ---------- */

const clonePlan = (p: Plan): Plan => ({
  points: { ...p.points },
  walls: { ...p.walls },
  doors: { ...p.doors },
  stairs: { ...p.stairs },
});

function removeOrphans(plan: Plan) {
  const used = new Set<string>();
  for (const w of Object.values(plan.walls)) {
    used.add(w.a);
    used.add(w.b);
  }
  for (const id of Object.keys(plan.points)) if (!used.has(id)) delete plan.points[id];
  for (const d of Object.values(plan.doors)) if (!plan.walls[d.wallId]) delete plan.doors[d.id];
}

function hasWallBetween(plan: Plan, a: string, b: string) {
  return Object.values(plan.walls).some((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a));
}

/** Coupe le mur `w` au point `pointId` (posé dessus) et répartit ses portes. */
export function splitWall(plan: Plan, w: Wall, pointId: string) {
  const A = plan.points[w.a];
  delete plan.walls[w.id];
  const w1 = uid();
  const w2 = uid();
  plan.walls[w1] = { id: w1, a: w.a, b: pointId, thickness: w.thickness };
  plan.walls[w2] = { id: w2, a: pointId, b: w.b, thickness: w.thickness };
  const split = distance(A, plan.points[pointId]);
  for (const d of Object.values(plan.doors)) {
    if (d.wallId !== w.id) continue;
    plan.doors[d.id] = d.offset < split ? { ...d, wallId: w1 } : { ...d, wallId: w2, offset: d.offset - split };
  }
}

/** Transforme une ancre en identifiant de point (en coupant un mur si besoin). */
function resolveAnchor(plan: Plan, anchor: Anchor): string {
  if (anchor.pointId && plan.points[anchor.pointId]) return anchor.pointId;
  for (const p of Object.values(plan.points)) if (distance(p, anchor) < EPS) return p.id;

  const id = uid();
  plan.points[id] = { id, x: anchor.x, y: anchor.y };

  if (anchor.onWallId !== undefined) {
    // Le point tombe sur un mur existant : on coupe ce mur en deux (jonction en T).
    for (const w of Object.values(plan.walls)) {
      const pr = projectOnSegment(anchor, plan.points[w.a], plan.points[w.b]);
      if (pr.d < EPS && pr.t > 0 && pr.t < 1) {
        splitWall(plan, w, id);
        break;
      }
    }
  }
  return id;
}

/** Si le point `id` est posé sur un autre point, les fusionne. */
function mergeAt(plan: Plan, id: string) {
  const p = plan.points[id];
  if (!p) return;
  const other = Object.values(plan.points).find((o) => o.id !== id && distance(o, p) < EPS);
  if (!other) return;

  for (const w of Object.values(plan.walls)) {
    if (w.a === id || w.b === id) {
      plan.walls[w.id] = { ...w, a: w.a === id ? other.id : w.a, b: w.b === id ? other.id : w.b };
    }
  }
  delete plan.points[id];

  // Supprime les murs devenus de longueur nulle ou en double.
  const seen = new Set<string>();
  for (const w of Object.values(plan.walls)) {
    const key = [w.a, w.b].sort().join('|');
    if (w.a === w.b || seen.has(key)) delete plan.walls[w.id];
    else seen.add(key);
  }
  removeOrphans(plan);
}

/**
 * Si le point est une jonction en T (posé au milieu d'un autre mur, c.-à-d. relié à
 * au moins deux autres murs alignés de part et d'autre), renvoie l'axe le long duquel
 * il peut glisser, avec les bornes à ne pas dépasser. Sinon null : le point est libre.
 */
export function getSlideAxis(plan: Pick<Plan, 'points' | 'walls'>, pointId: string, excludeWallId: string) {
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

/** Applique un déplacement `d` à un point, contraint à son axe de glissement s'il en a un. */
export function constrainedMove(origin: Vec, d: Vec, axis: ReturnType<typeof getSlideAxis>): Vec {
  if (!axis) return { x: origin.x + d.x, y: origin.y + d.y };
  const margin = 5;
  const t = clamp(d.x * axis.dir.x + d.y * axis.dir.y, axis.min + margin, axis.max - margin);
  return { x: origin.x + axis.dir.x * t, y: origin.y + axis.dir.y * t };
}

/* ---------- Store ---------- */

type State = Plan & {
  levels: LevelInfo[];
  activeLevelId: string;
  /** Plans des niveaux non affichés (le niveau actif est dans points/walls/doors/stairs). */
  inactive: Record<string, Plan>;

  tool: Tool;
  selection: Selection;
  past: Project[];
  future: Project[];
  newWallThickness: number;
  fitToken: number;

  setTool: (tool: Tool) => void;
  select: (selection: Selection) => void;
  /** Enregistre l'état courant dans l'historique (à appeler avant une modification). */
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  requestFit: () => void;

  addWall: (start: Anchor, end: Anchor) => string;
  movePoint: (id: string, x: number, y: number) => void;
  moveWall: (id: string, a: Vec, b: Vec) => void;
  mergePoint: (id: string) => void;
  setPointPosition: (id: string, x: number, y: number) => void;
  setWallLength: (id: string, length: number) => void;
  setWallThickness: (id: string, thickness: number) => void;
  setNewWallThickness: (thickness: number) => void;

  addDoor: (wallId: string, offset: number) => string;
  moveDoor: (id: string, offset: number) => void;
  updateDoor: (id: string, patch: Partial<Omit<Door, 'id' | 'wallId'>>) => void;

  addStair: (x: number, y: number) => string;
  moveStair: (id: string, x: number, y: number) => void;
  updateStair: (id: string, patch: Partial<Omit<Stair, 'id'>>) => void;

  deleteSelection: () => void;

  switchLevel: (id: string) => void;
  addLevel: () => void;
  renameLevel: (id: string, name: string) => void;
  deleteLevel: (id: string) => void;
  loadProject: (project: Project) => void;
  clearLevel: () => void;
};

const activePlan = (s: State): Plan => ({ points: s.points, walls: s.walls, doors: s.doors, stairs: s.stairs });

export const snapshot = (s: State): Project => ({
  levels: s.levels,
  activeLevelId: s.activeLevelId,
  data: { ...s.inactive, [s.activeLevelId]: activePlan(s) },
});

function restore(project: Project) {
  const { [project.activeLevelId]: active, ...inactive } = project.data;
  return { ...active, levels: project.levels, activeLevelId: project.activeLevelId, inactive };
}

const selectionExists = (sel: Selection, plan: Plan) => {
  if (!sel) return false;
  const table = { point: plan.points, wall: plan.walls, door: plan.doors, stair: plan.stairs }[sel.kind];
  return !!table[sel.id];
};

export const useStore = create<State>((set, get) => ({
  ...restore(loadInitial()),
  tool: 'select',
  selection: null,
  past: [],
  future: [],
  newWallThickness: 20,
  fitToken: 0,

  setTool: (tool) => set({ tool, selection: tool === 'select' ? get().selection : null }),
  select: (selection) => set({ selection }),

  checkpoint: () =>
    set((s) => ({ past: [...s.past, snapshot(s)].slice(-HISTORY_LIMIT), future: [] })),

  undo: () => {
    const s = get();
    const prev = s.past.at(-1);
    if (!prev) return;
    set({ ...restore(prev), past: s.past.slice(0, -1), future: [snapshot(s), ...s.future], selection: null });
  },

  redo: () => {
    const s = get();
    const next = s.future[0];
    if (!next) return;
    set({ ...restore(next), past: [...s.past, snapshot(s)], future: s.future.slice(1), selection: null });
  },

  requestFit: () => set((s) => ({ fitToken: s.fitToken + 1 })),

  /* ----- Murs et coins ----- */

  addWall: (start, end) => {
    get().checkpoint();
    const plan = clonePlan(activePlan(get()));
    const a = resolveAnchor(plan, start);
    const b = resolveAnchor(plan, end);
    if (a !== b && !hasWallBetween(plan, a, b)) {
      const id = uid();
      plan.walls[id] = { id, a, b, thickness: get().newWallThickness };
    }
    removeOrphans(plan);
    set(plan);
    return b;
  },

  movePoint: (id, x, y) =>
    set((s) => ({ points: { ...s.points, [id]: { ...s.points[id], x, y } } })),

  moveWall: (id, a, b) =>
    set((s) => {
      const w = s.walls[id];
      return {
        points: {
          ...s.points,
          [w.a]: { ...s.points[w.a], ...a },
          [w.b]: { ...s.points[w.b], ...b },
        },
      };
    }),

  mergePoint: (id) => {
    const plan = clonePlan(activePlan(get()));
    mergeAt(plan, id);
    const sel = get().selection;
    set({ ...plan, selection: selectionExists(sel, plan) ? sel : null });
  },

  setPointPosition: (id, x, y) => {
    get().checkpoint();
    get().movePoint(id, x, y);
    get().mergePoint(id);
  },

  setWallLength: (id, length) => {
    const s = get();
    const w = s.walls[id];
    if (!w || length < 1) return;
    const A = s.points[w.a];
    const B = s.points[w.b];
    const d = distance(A, B);
    if (d === 0) return;
    s.checkpoint();
    // On garde le point de départ et on déplace le point d'arrivée dans l'axe du mur.
    s.movePoint(w.b, A.x + ((B.x - A.x) / d) * length, A.y + ((B.y - A.y) / d) * length);
  },

  setWallThickness: (id, thickness) => {
    const w = get().walls[id];
    if (!w || thickness < 1) return;
    get().checkpoint();
    set((s) => ({ walls: { ...s.walls, [id]: { ...w, thickness } } }));
  },

  setNewWallThickness: (newWallThickness) => set({ newWallThickness }),

  /* ----- Portes ----- */

  addDoor: (wallId, offset) => {
    get().checkpoint();
    const id = uid();
    set((s) => ({
      doors: {
        ...s.doors,
        [id]: { id, wallId, offset, width: DEFAULT_DOOR_WIDTH, flip: false, hingeAtEnd: false },
      },
    }));
    return id;
  },

  moveDoor: (id, offset) => set((s) => ({ doors: { ...s.doors, [id]: { ...s.doors[id], offset } } })),

  updateDoor: (id, patch) => {
    if (!get().doors[id]) return;
    get().checkpoint();
    set((s) => ({ doors: { ...s.doors, [id]: { ...s.doors[id], ...patch } } }));
  },

  /* ----- Escaliers ----- */

  addStair: (x, y) => {
    get().checkpoint();
    const id = uid();
    set((s) => ({ stairs: { ...s.stairs, [id]: { id, x, y, width: 100, length: 300, rotation: 0 } } }));
    return id;
  },

  moveStair: (id, x, y) => set((s) => ({ stairs: { ...s.stairs, [id]: { ...s.stairs[id], x, y } } })),

  updateStair: (id, patch) => {
    if (!get().stairs[id]) return;
    get().checkpoint();
    set((s) => ({ stairs: { ...s.stairs, [id]: { ...s.stairs[id], ...patch } } }));
  },

  /* ----- Suppression ----- */

  deleteSelection: () => {
    const s = get();
    const sel = s.selection;
    if (!sel) return;
    s.checkpoint();
    const plan = clonePlan(activePlan(s));
    if (sel.kind === 'door') {
      delete plan.doors[sel.id];
    } else if (sel.kind === 'stair') {
      delete plan.stairs[sel.id];
    } else if (sel.kind === 'wall') {
      delete plan.walls[sel.id];
    } else {
      for (const w of Object.values(plan.walls)) {
        if (w.a === sel.id || w.b === sel.id) delete plan.walls[w.id];
      }
      delete plan.points[sel.id];
    }
    removeOrphans(plan);
    set({ ...plan, selection: null });
  },

  /* ----- Niveaux ----- */

  switchLevel: (id) => {
    const s = get();
    if (id === s.activeLevelId || !s.inactive[id]) return;
    set({ ...restore({ ...snapshot(s), activeLevelId: id }), selection: null });
  },

  addLevel: () => {
    const s = get();
    s.checkpoint();
    // Le nouvel étage (ajouté tout en haut) reprend les murs extérieurs (les plus épais) du niveau actuel.
    const plan = emptyPlan();
    const walls = Object.values(s.walls);
    const maxThickness = Math.max(0, ...walls.map((w) => w.thickness));
    for (const w of walls) {
      if (w.thickness !== maxThickness) continue;
      plan.walls[w.id] = w;
      plan.points[w.a] = s.points[w.a];
      plan.points[w.b] = s.points[w.b];
    }
    const id = uid();
    let n = s.levels.length;
    while (s.levels.some((l) => l.name === `Étage ${n}`)) n++;
    const levels = [...s.levels, { id, name: `Étage ${n}` }];
    const project = snapshot(s);
    set({ ...restore({ levels, activeLevelId: id, data: { ...project.data, [id]: plan } }), selection: null });
  },

  renameLevel: (id, name) => {
    const s = get();
    if (!name.trim() || s.levels.find((l) => l.id === id)?.name === name) return;
    s.checkpoint();
    set({ levels: s.levels.map((l) => (l.id === id ? { ...l, name: name.trim() } : l)) });
  },

  deleteLevel: (id) => {
    const s = get();
    if (s.levels.length <= 1) return;
    s.checkpoint();
    const index = s.levels.findIndex((l) => l.id === id);
    const levels = s.levels.filter((l) => l.id !== id);
    const { [id]: _removed, ...data } = snapshot(s).data;
    void _removed;
    const activeLevelId = id === s.activeLevelId ? levels[Math.max(0, index - 1)].id : s.activeLevelId;
    set({ ...restore({ levels, activeLevelId, data }), selection: null });
  },

  loadProject: (project) => {
    get().checkpoint();
    set((s) => ({ ...restore(project), selection: null, fitToken: s.fitToken + 1 }));
  },

  clearLevel: () => {
    get().checkpoint();
    set({ ...emptyPlan(), selection: null });
  },
}));

// Sauvegarde automatique dans le navigateur.
useStore.subscribe((s, prev) => {
  if (
    s.points === prev.points && s.walls === prev.walls && s.doors === prev.doors &&
    s.stairs === prev.stairs && s.levels === prev.levels && s.inactive === prev.inactive &&
    s.activeLevelId === prev.activeLevelId
  ) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot(s)));
  } catch {
    // stockage indisponible : pas de sauvegarde automatique
  }
});
