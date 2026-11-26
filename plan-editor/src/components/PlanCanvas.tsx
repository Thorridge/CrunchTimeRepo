import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Group, Layer, Line, Rect, Stage, Text } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import {
  constrainedMove,
  getSlideAxis,
  useStore,
  type Anchor,
  type Door,
  type Plan,
  type Stair,
  type Wall,
} from '../store';
import {
  bounds,
  clamp,
  distance,
  formatLength,
  projectOnSegment,
  snapValue,
  type Vec,
} from '../geometry';

const COLORS = {
  wall: '#1B2E4B',
  selected: '#D8232A',
  preview: '#D8232A',
  gridMinor: '#EEF1F5',
  gridMajor: '#D9E0E8',
  label: '#475569',
  handleFill: '#FFFFFF',
  snapWall: '#2E7D5B',
  door: '#263F66',
  stair: '#263F66',
  ghost: '#94A3B8',
  background: '#FFFFFF',
};

const MIN_SCALE = 0.05;
const MAX_SCALE = 5;
/** Distance d'aimantation, en pixels écran. */
const SNAP_PX = 12;

type View = { x: number; y: number; scale: number };
type Snap = Anchor & { kind: 'point' | 'wall' | 'grid' };
type SnapOptions = { from?: Vec | null; ortho?: boolean; excludePointId?: string; allowWall?: boolean };
type SlideAxis = ReturnType<typeof getSlideAxis>;

/*
 * Glisser « maison » : on ne laisse pas Konva déplacer les formes lui-même.
 * À chaque mouvement de souris on met à jour l'état, et tout le plan est redessiné
 * d'un coup à partir de cet état (sinon les murs attachés clignotent).
 */
type DragTarget =
  | { kind: 'wall'; id: string; a: Vec; b: Vec; axisA: SlideAxis; axisB: SlideAxis }
  | { kind: 'point'; id: string; origin: Vec }
  | { kind: 'door'; id: string }
  | { kind: 'stair'; id: string; origin: Vec };
type DragState = DragTarget & { start: Vec; started: boolean };

export function PlanCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const drag = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 0.6 });
  const [drawStart, setDrawStart] = useState<Anchor | null>(null);
  const [cursor, setCursor] = useState<Snap | null>(null);

  const points = useStore((s) => s.points);
  const walls = useStore((s) => s.walls);
  const doors = useStore((s) => s.doors);
  const stairs = useStore((s) => s.stairs);
  const tool = useStore((s) => s.tool);
  const selection = useStore((s) => s.selection);
  const fitToken = useStore((s) => s.fitToken);
  const newWallThickness = useStore((s) => s.newWallThickness);
  const activeLevelId = useStore((s) => s.activeLevelId);
  const levelBelow = useStore((s) => {
    const i = s.levels.findIndex((l) => l.id === s.activeLevelId);
    return i > 0 ? s.inactive[s.levels[i - 1].id] : null;
  });
  const { select, checkpoint, addWall, mergePoint, addDoor, addStair, setTool } = useStore.getState();

  const sizeReady = size.width > 0 && size.height > 0;

  /* ----- Taille du canvas = taille du conteneur ----- */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.floor(width), height: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ----- Recentrer le plan dans la vue ----- */
  useEffect(() => {
    if (!sizeReady) return;
    const pts = Object.values(useStore.getState().points);
    if (pts.length === 0) {
      setView({ x: size.width / 2, y: size.height / 2, scale: 0.6 });
      return;
    }
    const b = bounds(pts);
    const pad = 80;
    const w = Math.max(b.maxX - b.minX, 200);
    const h = Math.max(b.maxY - b.minY, 200);
    const scale = clamp(
      Math.min((size.width - 2 * pad) / w, (size.height - 2 * pad) / h),
      MIN_SCALE,
      MAX_SCALE,
    );
    setView({
      scale,
      x: size.width / 2 - ((b.minX + b.maxX) / 2) * scale,
      y: size.height / 2 - ((b.minY + b.maxY) / 2) * scale,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToken, sizeReady]);

  /* ----- Changer d'outil ou de niveau annule le tracé en cours ----- */
  useEffect(() => {
    setDrawStart(null);
    setCursor(null);
  }, [tool, activeLevelId]);

  /* ----- Raccourcis clavier ----- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const s = useStore.getState();
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        setDrawStart(null);
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        s.redo();
        setDrawStart(null);
        return;
      }
      if (mod) return;

      if (e.key === 'Escape') {
        if (drawStart) setDrawStart(null);
        else if (s.tool !== 'select') s.setTool('select');
        else s.select(null);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        s.deleteSelection();
      } else if (key === 'v') {
        s.setTool('select');
      } else if (key === 'm') {
        s.setTool('wall');
      } else if (key === 'p') {
        s.setTool('door');
      } else if (key === 'e') {
        s.setTool('stair');
      } else if (key === 'r' && s.selection?.kind === 'stair') {
        const st = s.stairs[s.selection.id];
        s.updateStair(st.id, { rotation: (st.rotation + 90) % 360 });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawStart]);

  /* ----- Aimantation : point existant > mur existant > grille ----- */
  const snap = (pos: Vec, opts: SnapOptions = {}): Snap => {
    const threshold = SNAP_PX / view.scale;

    let bestPoint: Snap | null = null;
    let bestD = threshold;
    for (const p of Object.values(points)) {
      if (p.id === opts.excludePointId) continue;
      const d = distance(p, pos);
      if (d < bestD) {
        bestD = d;
        bestPoint = { x: p.x, y: p.y, pointId: p.id, kind: 'point' };
      }
    }
    if (bestPoint) return bestPoint;

    let { x, y } = pos;
    let lockedAxis: 'x' | 'y' | null = null;
    if (opts.ortho && opts.from) {
      if (Math.abs(x - opts.from.x) > Math.abs(y - opts.from.y)) {
        y = opts.from.y;
        lockedAxis = 'y';
      } else {
        x = opts.from.x;
        lockedAxis = 'x';
      }
    }

    if (opts.allowWall) {
      let bestWall: Snap | null = null;
      for (const w of Object.values(walls)) {
        const pr = projectOnSegment({ x, y }, points[w.a], points[w.b]);
        if (pr.d < bestD && pr.t > 0.001 && pr.t < 0.999) {
          bestD = pr.d;
          bestWall = { x: pr.x, y: pr.y, onWallId: w.id, kind: 'wall' };
        }
      }
      if (bestWall) return bestWall;
    }

    return {
      x: lockedAxis === 'x' ? x : snapValue(x),
      y: lockedAxis === 'y' ? y : snapValue(y),
      kind: 'grid',
    };
  };

  /** Mur le plus proche d'une position (pour poser une porte). */
  const wallAt = (pos: Vec) => {
    let best: { wall: Wall; offset: number } | null = null;
    let bestD = Infinity;
    for (const w of Object.values(walls)) {
      const A = points[w.a];
      const B = points[w.b];
      const pr = projectOnSegment(pos, A, B);
      const reach = Math.max(w.thickness / 2, SNAP_PX / view.scale);
      if (pr.d < reach && pr.d < bestD) {
        bestD = pr.d;
        best = { wall: w, offset: pr.t * distance(A, B) };
      }
    }
    return best;
  };

  const worldPointer = () => stageRef.current?.getRelativePointerPosition() ?? null;

  const setPointerStyle = (style: string) => {
    if (drag.current) return; // pendant un glisser, le curseur reste « grabbing »
    const c = stageRef.current?.container();
    if (c) c.style.cursor = style;
  };

  /* ----- Glisser des murs, coins, portes, escaliers ----- */
  const beginDrag = (e: KonvaEventObject<MouseEvent>, target: DragTarget) => {
    if (tool !== 'select' || e.evt.button !== 0) return;
    e.cancelBubble = true; // empêche le fond (Stage) de démarrer son propre glisser
    const start = worldPointer();
    if (!start) return;
    select({ kind: target.kind, id: target.id });
    drag.current = { ...target, start, started: false };
    setDragging(true);
  };

  useEffect(() => {
    const stage = stageRef.current;
    if (!dragging || !stage) return;
    stage.draggable(false);

    const onMove = (evt: MouseEvent) => {
      const d = drag.current;
      if (!d) return;
      stage.setPointersPositions(evt);
      const pos = stage.getRelativePointerPosition();
      if (!pos) return;
      const delta = { x: pos.x - d.start.x, y: pos.y - d.start.y };

      if (!d.started) {
        // Petit seuil pour qu'un simple clic ne crée pas d'entrée dans l'historique.
        if (Math.hypot(delta.x, delta.y) * stage.scaleX() < 3) return;
        d.started = true;
        checkpoint();
        stage.container().style.cursor = 'grabbing';
      }

      const s = useStore.getState();
      const snapped = { x: snapValue(delta.x), y: snapValue(delta.y) };
      if (d.kind === 'wall') {
        s.moveWall(d.id, constrainedMove(d.a, snapped, d.axisA), constrainedMove(d.b, snapped, d.axisB));
      } else if (d.kind === 'point') {
        const p = snap({ x: d.origin.x + delta.x, y: d.origin.y + delta.y }, { excludePointId: d.id });
        s.movePoint(d.id, p.x, p.y);
      } else if (d.kind === 'stair') {
        s.moveStair(d.id, d.origin.x + snapped.x, d.origin.y + snapped.y);
      } else {
        const door = s.doors[d.id];
        const w = door && s.walls[door.wallId];
        if (!w) return;
        const A = s.points[w.a];
        const B = s.points[w.b];
        const len = distance(A, B);
        const pr = projectOnSegment(pos, A, B);
        s.moveDoor(d.id, clampDoorOffset(snapValue(pr.t * len, 5), door.width, len));
      }
    };

    const onUp = () => {
      const d = drag.current;
      drag.current = null;
      setDragging(false);
      stage.container().style.cursor = '';
      if (!d?.started) return;
      if (d.kind === 'wall') {
        const w = useStore.getState().walls[d.id];
        if (w) {
          mergePoint(w.a);
          mergePoint(w.b);
        }
      } else if (d.kind === 'point') {
        mergePoint(d.id);
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      stage.draggable(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  /* ----- Événements du canvas ----- */
  const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    if (tool !== 'wall') return;
    const pos = worldPointer();
    if (!pos) return;
    setCursor(snap(pos, { from: drawStart, ortho: e.evt.shiftKey, allowWall: true }));
  };

  const handleClick = (e: KonvaEventObject<MouseEvent>) => {
    if (e.evt.button !== 0) return;
    const pos = worldPointer();
    if (!pos) return;

    if (tool === 'select') {
      if (e.target === e.target.getStage()) select(null);
      return;
    }

    if (tool === 'door') {
      const hit = wallAt(pos);
      if (!hit) return;
      const id = addDoor(hit.wall.id, clampDoorOffset(hit.offset, 90, wallLength(hit.wall)));
      setTool('select');
      select({ kind: 'door', id });
      return;
    }

    if (tool === 'stair') {
      const id = addStair(snapValue(pos.x), snapValue(pos.y));
      setTool('select');
      select({ kind: 'stair', id });
      return;
    }

    const s = snap(pos, { from: drawStart, ortho: e.evt.shiftKey, allowWall: true });
    if (!drawStart) {
      setDrawStart(s);
      return;
    }
    if (distance(drawStart, s) < 1) return;

    const endId = addWall(drawStart, s);
    const end = useStore.getState().points[endId];
    // On enchaîne les murs, sauf si on vient de se raccrocher à un point ou un mur existant.
    setDrawStart(s.kind === 'grid' && end ? { x: end.x, y: end.y, pointId: endId } : null);
  };

  const endDrawing = () => setDrawStart(null);

  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    const factor = Math.exp(-e.evt.deltaY * (e.evt.ctrlKey ? 0.01 : 0.0015));
    const scale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
    const world = { x: (pointer.x - view.x) / view.scale, y: (pointer.y - view.y) / view.scale };
    setView({ scale, x: pointer.x - world.x * scale, y: pointer.y - world.y * scale });
  };

  const handleStageDrag = (e: KonvaEventObject<DragEvent>) => {
    if (e.target !== e.target.getStage()) return;
    setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
  };

  const wallLength = (w: Wall) => distance(points[w.a], points[w.b]);

  /* ----- Grille ----- */
  const grid = useMemo(() => {
    if (!sizeReady) return null;
    const minor = view.scale < 0.25 ? 100 : 50;
    const major = view.scale < 0.25 ? 500 : 100;
    const left = -view.x / view.scale;
    const top = -view.y / view.scale;
    const right = left + size.width / view.scale;
    const bottom = top + size.height / view.scale;
    const sw = 1 / view.scale;
    const lines = [];
    for (let x = Math.floor(left / minor) * minor; x <= right; x += minor) {
      lines.push(
        <Line key={`x${x}`} points={[x, top, x, bottom]} strokeWidth={sw}
          stroke={x % major === 0 ? COLORS.gridMajor : COLORS.gridMinor} />,
      );
    }
    for (let y = Math.floor(top / minor) * minor; y <= bottom; y += minor) {
      lines.push(
        <Line key={`y${y}`} points={[left, y, right, y]} strokeWidth={sw}
          stroke={y % major === 0 ? COLORS.gridMajor : COLORS.gridMinor} />,
      );
    }
    return lines;
  }, [view, size, sizeReady]);

  const wallList = Object.values(walls);
  const pointList = Object.values(points);
  const isSelect = tool === 'select';
  const handleRadius = 6 / view.scale;
  const pointerTools = tool === 'wall' || tool === 'door' || tool === 'stair';

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 bg-white"
      style={{ cursor: pointerTools ? 'crosshair' : 'default' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {sizeReady && (
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          x={view.x}
          y={view.y}
          scaleX={view.scale}
          scaleY={view.scale}
          draggable
          dragDistance={3}
          onDragMove={handleStageDrag}
          onDragEnd={handleStageDrag}
          onWheel={handleWheel}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setCursor(null)}
          onClick={handleClick}
          onDblClick={endDrawing}
          onContextMenu={endDrawing}
        >
          <Layer listening={false}>
            {grid}
            {levelBelow && <GhostLevel plan={levelBelow} scale={view.scale} />}
          </Layer>

          <Layer>
            {/* Escaliers (sous les murs) */}
            {Object.values(stairs).map((st) => (
              <StairShape
                key={st.id}
                stair={st}
                scale={view.scale}
                selected={selection?.kind === 'stair' && selection.id === st.id}
                onSelect={() => select({ kind: 'stair', id: st.id })}
                onMouseDown={(e) => beginDrag(e, { kind: 'stair', id: st.id, origin: { x: st.x, y: st.y } })}
                onHover={(on) => isSelect && setPointerStyle(on ? 'move' : '')}
                isSelectTool={isSelect}
              />
            ))}

            {/* Murs */}
            {wallList.map((w) => {
              const A = points[w.a];
              const B = points[w.b];
              const selected = selection?.kind === 'wall' && selection.id === w.id;
              return (
                <Line
                  key={w.id}
                  points={[A.x, A.y, B.x, B.y]}
                  stroke={selected ? COLORS.selected : COLORS.wall}
                  strokeWidth={w.thickness}
                  lineCap="square"
                  hitStrokeWidth={Math.max(w.thickness, 16 / view.scale)}
                  onMouseEnter={() => isSelect && setPointerStyle('move')}
                  onMouseLeave={() => isSelect && setPointerStyle('')}
                  onClick={(e) => {
                    if (!isSelect) return;
                    e.cancelBubble = true;
                    select({ kind: 'wall', id: w.id });
                  }}
                  onMouseDown={(e) => {
                    const plan = useStore.getState();
                    // Une extrémité posée au milieu d'un autre mur glisse le long de celui-ci
                    // au lieu de le déformer.
                    beginDrag(e, {
                      kind: 'wall',
                      id: w.id,
                      a: { x: A.x, y: A.y },
                      b: { x: B.x, y: B.y },
                      axisA: getSlideAxis(plan, w.a, w.id),
                      axisB: getSlideAxis(plan, w.b, w.id),
                    });
                  }}
                />
              );
            })}

            {/* Portes */}
            {Object.values(doors).map((d) => {
              const w = walls[d.wallId];
              if (!w) return null;
              return (
                <DoorShape
                  key={d.id}
                  door={d}
                  wall={w}
                  a={points[w.a]}
                  b={points[w.b]}
                  scale={view.scale}
                  selected={selection?.kind === 'door' && selection.id === d.id}
                  onSelect={() => select({ kind: 'door', id: d.id })}
                  onMouseDown={(e) => beginDrag(e, { kind: 'door', id: d.id })}
                  onHover={(on) => isSelect && setPointerStyle(on ? 'ew-resize' : '')}
                  isSelectTool={isSelect}
                />
              );
            })}

            {/* Mur en cours de tracé */}
            {drawStart && cursor && (
              <>
                <Line
                  points={[drawStart.x, drawStart.y, cursor.x, cursor.y]}
                  stroke={COLORS.preview}
                  opacity={0.55}
                  strokeWidth={newWallThickness}
                  lineCap="square"
                  listening={false}
                />
                <DimensionLabel a={drawStart} b={cursor} thickness={newWallThickness}
                  scale={view.scale} color={COLORS.preview} />
              </>
            )}

            {/* Cotes */}
            {wallList.map((w) => (
              <DimensionLabel key={w.id} a={points[w.a]} b={points[w.b]} thickness={w.thickness}
                scale={view.scale} color={COLORS.label} />
            ))}

            {/* Coins (poignées) */}
            {pointList.map((p) => {
              const selected = selection?.kind === 'point' && selection.id === p.id;
              return (
                <Circle
                  key={p.id}
                  x={p.x}
                  y={p.y}
                  radius={handleRadius}
                  fill={selected ? COLORS.selected : COLORS.handleFill}
                  stroke={selected ? COLORS.selected : COLORS.wall}
                  strokeWidth={1.5 / view.scale}
                  hitStrokeWidth={8 / view.scale}
                  listening={isSelect}
                  onMouseEnter={() => setPointerStyle('grab')}
                  onMouseLeave={() => setPointerStyle('')}
                  onClick={(e) => {
                    e.cancelBubble = true;
                    select({ kind: 'point', id: p.id });
                  }}
                  onMouseDown={(e) => beginDrag(e, { kind: 'point', id: p.id, origin: { x: p.x, y: p.y } })}
                />
              );
            })}

            {/* Indicateur d'aimantation en mode tracé */}
            {tool === 'wall' && cursor && (
              <Circle
                x={cursor.x}
                y={cursor.y}
                radius={(cursor.kind === 'grid' ? 4 : 7) / view.scale}
                fill={cursor.kind === 'point' ? COLORS.preview : undefined}
                stroke={cursor.kind === 'wall' ? COLORS.snapWall : COLORS.preview}
                strokeWidth={2 / view.scale}
                listening={false}
              />
            )}
          </Layer>
        </Stage>
      )}
    </div>
  );
}

/** Garde la porte entièrement sur son mur. */
function clampDoorOffset(offset: number, width: number, wallLen: number) {
  if (wallLen <= width) return wallLen / 2;
  return clamp(offset, width / 2, wallLen - width / 2);
}

/* ---------- Porte : ouverture dans le mur + battant + arc d'ouverture ---------- */

type ShapeHandlers = {
  scale: number;
  selected: boolean;
  isSelectTool: boolean;
  onSelect: () => void;
  onMouseDown: (e: KonvaEventObject<MouseEvent>) => void;
  onHover: (on: boolean) => void;
};

function DoorShape({ door, wall, a, b, scale, selected, isSelectTool, onSelect, onMouseDown, onHover }:
  ShapeHandlers & { door: Door; wall: Wall; a: Vec; b: Vec }) {
  const len = distance(a, b);
  if (len < 1) return null;
  const width = Math.min(door.width, len);
  const offset = clampDoorOffset(door.offset, width, len);
  const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }; // le long du mur
  const n = { x: -u.y, y: u.x }; // perpendiculaire
  const side = door.flip ? -1 : 1;
  const center = { x: a.x + u.x * offset, y: a.y + u.y * offset };
  const angle = (Math.atan2(u.y, u.x) * 180) / Math.PI;

  // Gonds sur une extrémité de l'ouverture, battant ouvert à 90° vers `side`.
  const toOther = door.hingeAtEnd ? -1 : 1; // direction gond → autre montant
  const hinge = {
    x: center.x - u.x * toOther * (width / 2) + n.x * side * (wall.thickness / 2),
    y: center.y - u.y * toOther * (width / 2) + n.y * side * (wall.thickness / 2),
  };
  const arc: number[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = (i / 16) * (Math.PI / 2);
    arc.push(
      hinge.x + width * (Math.cos(t) * u.x * toOther + Math.sin(t) * n.x * side),
      hinge.y + width * (Math.cos(t) * u.y * toOther + Math.sin(t) * n.y * side),
    );
  }
  const leafEnd = { x: hinge.x + n.x * side * width, y: hinge.y + n.y * side * width };
  const color = selected ? COLORS.selected : COLORS.door;

  return (
    <Group
      onClick={(e) => {
        if (!isSelectTool) return;
        e.cancelBubble = true;
        onSelect();
      }}
      onMouseDown={onMouseDown}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      {/* Ouverture : on « efface » le mur */}
      <Rect
        x={center.x}
        y={center.y}
        width={width}
        height={wall.thickness + 2 / scale}
        offsetX={width / 2}
        offsetY={(wall.thickness + 2 / scale) / 2}
        rotation={angle}
        fill={COLORS.background}
        stroke={color}
        strokeWidth={1 / scale}
      />
      <Line points={arc} stroke={color} strokeWidth={1 / scale} dash={[6 / scale, 4 / scale]} />
      <Line points={[hinge.x, hinge.y, leafEnd.x, leafEnd.y]} stroke={color} strokeWidth={4 / scale} lineCap="round" />
    </Group>
  );
}

/* ---------- Escalier : marches + flèche de montée ---------- */

const STEP_DEPTH = 28; // giron moyen, en cm

function StairShape({ stair, scale, selected, isSelectTool, onSelect, onMouseDown, onHover }:
  ShapeHandlers & { stair: Stair }) {
  const { width: w, length: l } = stair;
  const color = selected ? COLORS.selected : COLORS.stair;
  const steps = Math.max(2, Math.round(l / STEP_DEPTH));
  const lines = [];
  for (let i = 1; i < steps; i++) {
    const y = -l / 2 + (i * l) / steps;
    lines.push(<Line key={i} points={[-w / 2, y, w / 2, y]} stroke={color} strokeWidth={1 / scale} />);
  }
  const arrowHead = Math.min(w * 0.25, 25);

  return (
    <Group
      x={stair.x}
      y={stair.y}
      rotation={stair.rotation}
      onClick={(e) => {
        if (!isSelectTool) return;
        e.cancelBubble = true;
        onSelect();
      }}
      onMouseDown={onMouseDown}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <Rect x={-w / 2} y={-l / 2} width={w} height={l} fill="#F1F5F9" stroke={color}
        strokeWidth={(selected ? 2.5 : 1.5) / scale} />
      {lines}
      {/* Flèche « monte » : du bas vers le haut */}
      <Line points={[0, l / 2 - 15, 0, -l / 2 + 15]} stroke={color} strokeWidth={2 / scale} />
      <Line
        points={[-arrowHead / 2, -l / 2 + 15 + arrowHead, 0, -l / 2 + 15, arrowHead / 2, -l / 2 + 15 + arrowHead]}
        stroke={color}
        strokeWidth={2 / scale}
        lineJoin="round"
      />
    </Group>
  );
}

/* ---------- Niveau du dessous, en transparence ---------- */

function GhostLevel({ plan, scale }: { plan: Plan; scale: number }) {
  return (
    <>
      {Object.values(plan.walls).map((w) => {
        const A = plan.points[w.a];
        const B = plan.points[w.b];
        return (
          <Line key={w.id} points={[A.x, A.y, B.x, B.y]} stroke={COLORS.ghost} opacity={0.25}
            strokeWidth={w.thickness} lineCap="square" />
        );
      })}
      {Object.values(plan.stairs).map((st) => (
        <Group key={st.id} x={st.x} y={st.y} rotation={st.rotation}>
          <Rect x={-st.width / 2} y={-st.length / 2} width={st.width} height={st.length}
            stroke={COLORS.ghost} strokeWidth={1.5 / scale} dash={[8 / scale, 5 / scale]} />
          <Text text="Arrivée escalier" fontSize={11 / scale} fill={COLORS.ghost} fontStyle="600"
            width={st.width} align="center" x={-st.width / 2} y={-6 / scale} />
        </Group>
      ))}
    </>
  );
}

function DimensionLabel({ a, b, thickness, scale, color }: {
  a: Vec; b: Vec; thickness: number; scale: number; color: string;
}) {
  const len = distance(a, b);
  if (len * scale < 40) return null; // trop petit pour être lisible
  let angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle <= -90) angle += 180;
  const fontSize = 12 / scale;
  const width = 120 / scale;
  return (
    <Text
      x={(a.x + b.x) / 2}
      y={(a.y + b.y) / 2}
      rotation={angle}
      text={formatLength(len)}
      fontSize={fontSize}
      fontFamily="Inter, sans-serif"
      fontStyle="600"
      fill={color}
      width={width}
      align="center"
      offsetX={width / 2}
      offsetY={thickness / 2 + fontSize + 4 / scale}
      listening={false}
    />
  );
}
