import { useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, OrbitControls, Sky } from '@react-three/drei';
import * as THREE from 'three';
import { useStore, type Door, type Plan, type Stair, type Wall } from '../store';
import { bounds, distance, type Vec } from '../geometry';
import { floorOutline } from '../rules';
import { DEFAULT_WALL_COLOR, type Furniture } from '../furniture';
import { shade } from '../color';

/*
 * Vue 3D générée à partir du plan 2D. Les distances du plan sont en cm ;
 * en 3D on travaille en mètres. Le plan (x, y) devient (x, z) en 3D, la hauteur est y.
 */
const M = 0.01; // cm → m
const WALL_HEIGHT = 260; // hauteur sous plafond
const SLAB = 20; // épaisseur de dalle
const LEVEL_HEIGHT = WALL_HEIGHT + SLAB;
const DOOR_HEIGHT = 210;

const COLORS = {
  structuralWall: '#E7E2D9',
  slab: '#CFC9BD',
  door: '#B9875A',
  frame: '#F8FAFC',
  glass: '#A5D8F3',
  stair: '#C9A27C',
  ground: '#B9CDA8',
};

const NO_STAIRS: Plan['stairs'] = {};

export function Scene3D() {
  const levels = useStore((s) => s.levels);
  const activeLevelId = useStore((s) => s.activeLevelId);
  const points = useStore((s) => s.points);
  const walls = useStore((s) => s.walls);
  const doors = useStore((s) => s.doors);
  const stairs = useStore((s) => s.stairs);
  const furniture = useStore((s) => s.furniture);
  const floorColor = useStore((s) => s.floorColor);
  const inactive = useStore((s) => s.inactive);
  const data: Record<string, Plan> = {
    ...inactive,
    [activeLevelId]: { points, walls, doors, stairs, furniture, floorColor },
  };

  // On affiche le niveau actif et ceux du dessous (vue « en coupe » des étages).
  const activeIndex = levels.findIndex((l) => l.id === activeLevelId);
  const visible = levels.slice(0, activeIndex + 1);

  const allPoints = levels.flatMap((l) => Object.values(data[l.id].points));
  const b = allPoints.length ? bounds(allPoints) : { minX: -500, minY: -500, maxX: 500, maxY: 500 };
  const center = { x: ((b.minX + b.maxX) / 2) * M, z: ((b.minY + b.maxY) / 2) * M };
  const span = Math.max(b.maxX - b.minX, b.maxY - b.minY, 600) * M;
  const height = visible.length * LEVEL_HEIGHT * M;
  const sun: [number, number, number] = [center.x + span, span * 1.6, center.z + span * 0.7];

  return (
    <div className="absolute inset-0 bg-sky-100">
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        camera={{
          position: [center.x + span * 0.9, height + span * 0.8, center.z + span * 1.1],
          fov: 40,
          near: 0.1,
          far: 1000,
        }}
      >
        <Sky sunPosition={sun} turbidity={4} rayleigh={0.6} mieCoefficient={0.004} />
        <hemisphereLight args={['#ffffff', '#9DB08F', 0.85]} />
        <ambientLight intensity={0.25} />
        <directionalLight
          position={sun}
          intensity={2}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0004}
          shadow-camera-left={-span}
          shadow-camera-right={span}
          shadow-camera-top={span}
          shadow-camera-bottom={-span}
          shadow-camera-far={span * 6}
        >
          <object3D attach="target" position={[center.x, 0, center.z]} />
        </directionalLight>

        {/* Terrain */}
        <mesh rotation-x={-Math.PI / 2} position={[center.x, -0.02, center.z]} receiveShadow>
          <circleGeometry args={[span * 4, 64]} />
          <meshStandardMaterial color={COLORS.ground} roughness={1} />
        </mesh>
        <ContactShadows position={[center.x, 0, center.z]} scale={span * 2.5} opacity={0.3} blur={2.5} far={6} />

        {visible.map((level, i) => (
          <LevelMesh
            key={level.id}
            plan={data[level.id]}
            stairsBelow={i > 0 ? data[visible[i - 1].id].stairs : NO_STAIRS}
            elevation={i * LEVEL_HEIGHT}
          />
        ))}

        <OrbitControls
          target={[center.x, height / 3, center.z]}
          maxPolarAngle={Math.PI / 2 - 0.05}
          minDistance={1}
          maxDistance={span * 5}
          enableDamping
          makeDefault
        />
      </Canvas>

      <div className="pointer-events-none absolute right-4 top-4 rounded-xl bg-white/90 px-3 py-2 text-xs text-slate-600 shadow">
        Glisser : tourner · Clic droit : déplacer · Molette : zoomer
      </div>
    </div>
  );
}

/* ---------- Un niveau : dalle, sol, murs, ouvertures, escaliers, mobilier ---------- */

function LevelMesh({ plan, stairsBelow, elevation }: { plan: Plan; stairsBelow: Plan['stairs']; elevation: number }) {
  const walls = Object.values(plan.walls);
  const doors = Object.values(plan.doors);

  return (
    <group position={[0, elevation * M, 0]}>
      {elevation > 0 && <Slab plan={plan} holes={stairsBelow} />}
      <FloorSurface plan={plan} holes={elevation > 0 ? stairsBelow : NO_STAIRS} />
      {walls.map((w) => (
        <WallMesh
          key={w.id}
          wall={w}
          a={plan.points[w.a]}
          b={plan.points[w.b]}
          openings={doors.filter((d) => d.wallId === w.id)}
        />
      ))}
      {doors.map((d) => {
        const w = plan.walls[d.wallId];
        if (!w) return null;
        return d.kind === 'window' ? (
          <WindowPane key={d.id} win={d} wall={w} a={plan.points[w.a]} b={plan.points[w.b]} />
        ) : (
          <DoorLeaf key={d.id} door={d} wall={w} a={plan.points[w.a]} b={plan.points[w.b]} />
        );
      })}
      {Object.values(plan.stairs).map((s) => (
        <StairMesh key={s.id} stair={s} />
      ))}
      {Object.values(plan.furniture).map((f) => (
        <FurnitureMesh key={f.id} item={f} />
      ))}
    </group>
  );
}

/** Forme 2D du plan (x, -y) avec trous ; après rotation de -90° autour de X, -y devient z. */
function outlineShape(outline: Vec[], holes: Plan['stairs']) {
  const shape = new THREE.Shape();
  outline.forEach((p, i) => (i === 0 ? shape.moveTo(p.x * M, -p.y * M) : shape.lineTo(p.x * M, -p.y * M)));
  shape.closePath();
  for (const s of Object.values(holes)) {
    const hole = new THREE.Path();
    stairCorners(s).forEach((c, i) => (i === 0 ? hole.moveTo(c.x * M, -c.y * M) : hole.lineTo(c.x * M, -c.y * M)));
    hole.closePath();
    shape.holes.push(hole);
  }
  return shape;
}

/** Dalle de l'étage, percée là où arrivent les escaliers du niveau du dessous. */
function Slab({ plan, holes }: { plan: Plan; holes: Plan['stairs'] }) {
  const geometry = useMemo(() => {
    const outline = floorOutline(plan);
    if (!outline) return null;
    return new THREE.ExtrudeGeometry(outlineShape(outline, holes), { depth: SLAB * M, bevelEnabled: false });
  }, [plan.points, plan.walls, holes]);
  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry} rotation-x={-Math.PI / 2} position={[0, -SLAB * M, 0]} castShadow receiveShadow>
      <meshStandardMaterial color={COLORS.slab} />
    </mesh>
  );
}

/** Revêtement de sol (parquet, carrelage…) à la couleur choisie pour le niveau. */
function FloorSurface({ plan, holes }: { plan: Plan; holes: Plan['stairs'] }) {
  const geometry = useMemo(() => {
    const outline = floorOutline(plan);
    return outline ? new THREE.ShapeGeometry(outlineShape(outline, holes)) : null;
  }, [plan.points, plan.walls, holes]);
  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry} rotation-x={-Math.PI / 2} position={[0, 0.004, 0]} receiveShadow>
      <meshStandardMaterial color={plan.floorColor} roughness={0.7} />
    </mesh>
  );
}

/** Mur extrudé, percé par ses portes (linteau au-dessus) et fenêtres (allège + linteau). */
function WallMesh({ wall, a, b, openings }: { wall: Wall; a: Vec; b: Vec; openings: Door[] }) {
  const len = distance(a, b);
  if (len < 1) return null;
  const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const angle = -Math.atan2(u.y, u.x);
  const t = wall.thickness;

  const holes = openings
    .map((d) => {
      const w = Math.min(d.width, len);
      const o = Math.min(Math.max(d.offset, w / 2), len - w / 2);
      const bottom = d.kind === 'window' ? (d.sill ?? 90) : 0;
      const top = d.kind === 'window' ? Math.min(bottom + (d.height ?? 125), WALL_HEIGHT - 5) : DOOR_HEIGHT;
      return { s0: o - w / 2, s1: o + w / 2, bottom, top };
    })
    .sort((p, q) => p.s0 - q.s0);

  const pieces: { s0: number; s1: number; y0: number; y1: number }[] = [];
  let cursor = -t / 2; // déborde d'une demi-épaisseur pour fermer les angles
  for (const h of holes) {
    if (h.s0 > cursor) pieces.push({ s0: cursor, s1: h.s0, y0: 0, y1: WALL_HEIGHT });
    if (h.bottom > 0) pieces.push({ s0: h.s0, s1: h.s1, y0: 0, y1: h.bottom });
    pieces.push({ s0: h.s0, s1: h.s1, y0: h.top, y1: WALL_HEIGHT });
    cursor = Math.max(cursor, h.s1);
  }
  if (len + t / 2 > cursor) pieces.push({ s0: cursor, s1: len + t / 2, y0: 0, y1: WALL_HEIGHT });

  const color = wall.color ?? (wall.structural ? COLORS.structuralWall : DEFAULT_WALL_COLOR);
  return (
    <>
      {pieces.map((p, i) => {
        const mid = (p.s0 + p.s1) / 2;
        return (
          <mesh
            key={i}
            position={[(a.x + u.x * mid) * M, ((p.y0 + p.y1) / 2) * M, (a.y + u.y * mid) * M]}
            rotation-y={angle}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[(p.s1 - p.s0) * M, (p.y1 - p.y0) * M, t * M]} />
            <meshStandardMaterial color={color} roughness={0.9} />
          </mesh>
        );
      })}
    </>
  );
}

/** Vitrage + cadre d'une fenêtre. */
function WindowPane({ win, wall, a, b }: { win: Door; wall: Wall; a: Vec; b: Vec }) {
  const len = distance(a, b);
  if (len < 1) return null;
  const w = Math.min(win.width, len);
  const o = Math.min(Math.max(win.offset, w / 2), len - w / 2);
  const sill = win.sill ?? 90;
  const h = Math.min(win.height ?? 125, WALL_HEIGHT - 5 - sill);
  const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const c = { x: a.x + u.x * o, y: a.y + u.y * o };
  const frame = 6;
  const depth = Math.min(wall.thickness, 10);

  return (
    <group position={[c.x * M, (sill + h / 2) * M, c.y * M]} rotation-y={-Math.atan2(u.y, u.x)}>
      <mesh>
        <boxGeometry args={[w * M, h * M, 1.5 * M]} />
        <meshPhysicalMaterial color={COLORS.glass} transparent opacity={0.35} roughness={0.05} metalness={0.1} />
      </mesh>
      {/* Cadre : haut, bas, gauche, droite, et un montant central pour les grandes fenêtres */}
      <Box p={[0, h / 2 - frame / 2, 0]} s={[w, frame, depth]} c={COLORS.frame} />
      <Box p={[0, -h / 2 + frame / 2, 0]} s={[w, frame, depth]} c={COLORS.frame} />
      <Box p={[-w / 2 + frame / 2, 0, 0]} s={[frame, h, depth]} c={COLORS.frame} />
      <Box p={[w / 2 - frame / 2, 0, 0]} s={[frame, h, depth]} c={COLORS.frame} />
      {w > 100 && <Box p={[0, 0, 0]} s={[frame * 0.8, h, depth]} c={COLORS.frame} />}
      {/* Appui de fenêtre */}
      <Box p={[0, -h / 2 - 2, wall.thickness / 2]} s={[w + 8, 4, 8]} c={COLORS.frame} />
    </group>
  );
}

/** Battant de porte ouvert à 90°, comme sur le plan 2D. */
function DoorLeaf({ door, wall, a, b }: { door: Door; wall: Wall; a: Vec; b: Vec }) {
  const len = distance(a, b);
  if (len < 1) return null;
  const width = Math.min(door.width, len);
  const offset = Math.min(Math.max(door.offset, width / 2), len - width / 2);
  const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const n = { x: -u.y, y: u.x };
  const side = door.flip ? -1 : 1;
  const toOther = door.hingeAtEnd ? -1 : 1;
  const hinge = {
    x: a.x + u.x * (offset - toOther * (width / 2)) + n.x * side * (wall.thickness / 2),
    y: a.y + u.y * (offset - toOther * (width / 2)) + n.y * side * (wall.thickness / 2),
  };
  const c = { x: hinge.x + n.x * side * (width / 2), y: hinge.y + n.y * side * (width / 2) };
  const angle = -Math.atan2(n.y, n.x);
  const leafHeight = DOOR_HEIGHT - 5;

  return (
    <group position={[c.x * M, 0, c.y * M]} rotation-y={angle}>
      <Box p={[0, leafHeight / 2, 0]} s={[width, leafHeight, 4]} c={COLORS.door} />
      {/* Poignée */}
      <Box p={[width / 2 - 8, 105, 3]} s={[12, 2, 2]} c="#94A3B8" />
    </group>
  );
}

/** Escalier droit : une marche par giron, de la hauteur d'un niveau. */
function StairMesh({ stair }: { stair: Stair }) {
  const steps = Math.max(2, Math.round(stair.length / 28));
  const run = stair.length / steps;
  const rise = LEVEL_HEIGHT / steps;
  return (
    <group position={[stair.x * M, 0, stair.y * M]} rotation-y={(-stair.rotation * Math.PI) / 180}>
      {Array.from({ length: steps }, (_, i) => {
        const h = rise * (i + 1);
        // La montée part du bas du rectangle (local +y) vers le haut (local -y).
        const z = stair.length / 2 - (i + 0.5) * run;
        return <Box key={i} p={[0, h / 2, z]} s={[stair.width, h, run]} c={i % 2 ? COLORS.stair : shade(COLORS.stair, -0.06)} />;
      })}
    </group>
  );
}

/* ---------- Mobilier ---------- */

/** Boîte en cm : position du centre, taille, couleur. */
function Box({ p, s, c, rough = 0.8 }: { p: [number, number, number]; s: [number, number, number]; c: string; rough?: number }) {
  return (
    <mesh position={[p[0] * M, p[1] * M, p[2] * M]} castShadow receiveShadow>
      <boxGeometry args={[s[0] * M, s[1] * M, s[2] * M]} />
      <meshStandardMaterial color={c} roughness={rough} />
    </mesh>
  );
}

function FurnitureMesh({ item }: { item: Furniture }) {
  return (
    <group position={[item.x * M, 0, item.y * M]} rotation-y={(-item.rotation * Math.PI) / 180}>
      <FurnitureModel item={item} />
    </group>
  );
}

/** Modèles simples en blocs ; l'avant du meuble est du côté +z. */
function FurnitureModel({ item }: { item: Furniture }) {
  const { width: w, depth: d, color } = item;
  const dark = shade(color, -0.25);
  const light = shade(color, 0.35);

  switch (item.type) {
    case 'kitchen':
      return (
        <>
          <Box p={[0, 43, 1]} s={[w, 86, d - 2]} c={color} />
          <Box p={[0, 88, 0]} s={[w, 4, d]} c="#3F3F46" rough={0.4} />
          {/* Évier : rebord inox posé sur le plan de travail (dessus à 90 cm), cuve plus sombre et robinet.
              Aucune face au même niveau qu'une autre, sinon elles scintillent (z-fighting). */}
          <Box p={[-w / 4, 90.3, 0]} s={[50, 0.6, d * 0.62]} c="#CBD5E1" rough={0.25} />
          <Box p={[-w / 4, 90.45, 1]} s={[40, 0.5, d * 0.46]} c="#7C8794" rough={0.35} />
          <Box p={[-w / 4, 97, -d / 2 + 7]} s={[2.2, 14, 2.2]} c="#9CA3AF" rough={0.2} />
          <Box p={[-w / 4, 103, -d / 2 + 12]} s={[2.2, 2.2, 12]} c="#9CA3AF" rough={0.2} />
          {/* Plaque de cuisson */}
          <Box p={[w / 4, 90.4, 0]} s={[58, 0.8, d * 0.75]} c="#111827" rough={0.3} />
          {/* Meubles hauts */}
          <Box p={[0, 185, -d / 2 + 17]} s={[w, 70, 34]} c={color} />
          {/* Façades */}
          {(() => {
            const n = Math.max(1, Math.round(w / 60));
            const step = w / n;
            return Array.from({ length: n }, (_, i) => (
              <Box key={i} p={[-w / 2 + step * (i + 0.5), 43, d / 2]} s={[step - 2, 80, 1]} c={light} />
            ));
          })()}
        </>
      );
    case 'fridge':
      return (
        <>
          <Box p={[0, 92, 0]} s={[w, 184, d]} c={color} rough={0.35} />
          <Box p={[0, 120, d / 2]} s={[w - 2, 1, 1.5]} c={dark} />
          <Box p={[w / 2 - 6, 140, d / 2 + 2]} s={[2, 30, 3]} c="#94A3B8" />
          <Box p={[w / 2 - 6, 85, d / 2 + 2]} s={[2, 30, 3]} c="#94A3B8" />
        </>
      );
    case 'table': {
      const leg = 6;
      return (
        <>
          <Box p={[0, 73, 0]} s={[w, 4, d]} c={color} rough={0.6} />
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([i, j]) => (
            <Box key={`${i}${j}`} p={[i * (w / 2 - leg), 35.5, j * (d / 2 - leg)]} s={[leg, 71, leg]} c={dark} />
          ))}
        </>
      );
    }
    case 'chair':
      return (
        <>
          <Box p={[0, 45, 2]} s={[w, 5, d - 4]} c={color} />
          <Box p={[0, 70, -d / 2 + 3]} s={[w, 45, 4]} c={color} />
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([i, j]) => (
            <Box key={`${i}${j}`} p={[i * (w / 2 - 3), 21, j * (d / 2 - 3)]} s={[3, 42, 3]} c={dark} />
          ))}
        </>
      );
    case 'sofa': {
      const arm = Math.min(w * 0.1, 20);
      const back = d * 0.25;
      return (
        <>
          <Box p={[0, 20, 0]} s={[w, 30, d]} c={dark} />
          <Box p={[0, 42, back / 2]} s={[w - 2 * arm, 14, d - back]} c={color} rough={1} />
          <Box p={[0, 57, -d / 2 + back / 2]} s={[w, 44, back]} c={color} rough={1} />
          <Box p={[-w / 2 + arm / 2, 45, 0]} s={[arm, 20, d]} c={color} rough={1} />
          <Box p={[w / 2 - arm / 2, 45, 0]} s={[arm, 20, d]} c={color} rough={1} />
        </>
      );
    }
    case 'tv': {
      const sw = w * 0.84;
      const sh = (sw * 9) / 16;
      return (
        <>
          <Box p={[0, 22, 0]} s={[w, 44, d]} c={color} />
          <Box p={[0, 50, -d / 2 + 10]} s={[12, 6, 8]} c="#111827" />
          <Box p={[0, 54 + sh / 2, -d / 2 + 10]} s={[sw, sh, 3]} c="#0B0F19" rough={0.2} />
        </>
      );
    }
    case 'bed':
      return (
        <>
          <Box p={[0, 15, 0]} s={[w, 30, d]} c={dark} />
          <Box p={[0, 40, 0]} s={[w - 4, 20, d - 4]} c="#F8FAFC" rough={1} />
          <Box p={[0, 51, d * 0.175]} s={[w - 2, 4, d * 0.65]} c={color} rough={1} />
          <Box p={[-w / 4, 54, -d / 2 + 25]} s={[w / 2 - 14, 10, 30]} c="#FFFFFF" rough={1} />
          <Box p={[w / 4, 54, -d / 2 + 25]} s={[w / 2 - 14, 10, 30]} c="#FFFFFF" rough={1} />
          <Box p={[0, 55, -d / 2 + 3]} s={[w, 110, 6]} c={dark} />
        </>
      );
  }
}

function stairCorners(s: Stair) {
  const r = (s.rotation * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [
    [-s.width / 2, -s.length / 2],
    [s.width / 2, -s.length / 2],
    [s.width / 2, s.length / 2],
    [-s.width / 2, s.length / 2],
  ].map(([lx, ly]) => ({ x: s.x + lx * cos - ly * sin, y: s.y + lx * sin + ly * cos }));
}
