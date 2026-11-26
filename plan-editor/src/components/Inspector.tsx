import { useEffect, useState, type ReactNode } from 'react';
import { useStore, type Door, type Furniture, type Point, type Stair, type Wall } from '../store';
import { distance, formatLength } from '../geometry';
import { pointConstraint } from '../rules';
import {
  CATALOG,
  DEFAULT_WALL_COLOR,
  FLOOR_COLORS,
  FLOOR_LABELS,
  FURNITURE_COLORS,
  WALL_COLORS,
} from '../furniture';

const THICKNESS_PRESETS = [10, 20, 30];

export function Inspector() {
  const mode = useStore((s) => s.mode);
  const selection = useStore((s) => s.selection);
  const walls = useStore((s) => s.walls);
  const points = useStore((s) => s.points);
  const doors = useStore((s) => s.doors);
  const stairs = useStore((s) => s.stairs);
  const furniture = useStore((s) => s.furniture);

  if (mode === '3d') return <View3DPanel />;
  if (selection?.kind === 'furniture' && furniture[selection.id]) {
    return <FurniturePanel item={furniture[selection.id]} />;
  }
  if (selection?.kind === 'wall' && walls[selection.id]) {
    return <WallPanel wall={walls[selection.id]} />;
  }
  if (selection?.kind === 'point' && points[selection.id]) {
    return <PointPanel point={points[selection.id]} />;
  }
  if (selection?.kind === 'door' && doors[selection.id]) {
    return <DoorPanel door={doors[selection.id]} />;
  }
  if (selection?.kind === 'stair' && stairs[selection.id]) {
    return <StairPanel stair={stairs[selection.id]} />;
  }
  return <OverviewPanel />;
}

function View3DPanel() {
  const setMode = useStore((s) => s.setMode);
  return (
    <Panel title="Vue 3D">
      <LevelSection />
      <p className="text-sm text-slate-600">
        La 3D affiche le niveau sélectionné et ceux du dessous. Choisis « Rez-de-chaussée » dans
        les niveaux pour voir l'intérieur du bas.
      </p>
      <ul className="space-y-1.5 text-sm text-slate-600">
        <Help k="Glisser">tourner autour de la maison</Help>
        <Help k="Clic droit">se déplacer</Help>
        <Help k="Molette">zoomer</Help>
      </ul>
      <ColorSection />
      <SecondaryButton onClick={() => setMode('2d')}>← Revenir au plan 2D pour modifier</SecondaryButton>
    </Panel>
  );
}

/** Couleurs du niveau : sol et murs (visibles en 3D). */
function ColorSection() {
  const floorColor = useStore((s) => s.floorColor);
  const { setFloorColor, setWallColor } = useStore.getState();
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 p-3">
      <div className="flex flex-col gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Sol · {FLOOR_LABELS[floorColor] ?? 'Personnalisé'}
        </span>
        <Swatches colors={FLOOR_COLORS} value={floorColor} onPick={setFloorColor} titles={FLOOR_LABELS} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Peinture des cloisons</span>
        <Swatches colors={WALL_COLORS} onPick={(c) => setWallColor('partitions', c)} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Tous les murs</span>
        <Swatches colors={WALL_COLORS} onPick={(c) => setWallColor('all', c)} />
      </div>
    </div>
  );
}

function FurniturePanel({ item }: { item: Furniture }) {
  const { updateFurniture, deleteSelection } = useStore.getState();
  const c = CATALOG[item.type];
  return (
    <Panel title={c.label}>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Largeur" suffix="cm" value={Math.round(item.width)} min={20}
          onCommit={(v) => updateFurniture(item.id, { width: v })} />
        <NumberField label="Profondeur" suffix="cm" value={Math.round(item.depth)} min={20}
          onCommit={(v) => updateFurniture(item.id, { depth: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <SecondaryButton onClick={() => updateFurniture(item.id, { rotation: (item.rotation + 90) % 360 })}>
          ↻ 90° (R)
        </SecondaryButton>
        <SecondaryButton onClick={() => updateFurniture(item.id, { rotation: (item.rotation + 15) % 360 })}>
          ↻ 15° (Maj+R)
        </SecondaryButton>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Couleur</span>
        <Swatches colors={FURNITURE_COLORS} value={item.color} onPick={(color) => updateFurniture(item.id, { color })} />
        <CustomColor value={item.color} onPick={(color) => updateFurniture(item.id, { color })} />
      </div>
      <button type="button" onClick={() => updateFurniture(item.id, { width: c.width, depth: c.depth, color: c.color })}
        className="cursor-pointer self-start text-xs font-semibold text-slate-500 hover:text-tp-navy hover:underline">
        Revenir aux dimensions et à la couleur d'origine
      </button>
      <p className="-mt-2 text-xs text-slate-500">Glisse le meuble pour le déplacer.</p>
      <DeleteButton onClick={deleteSelection}>Supprimer</DeleteButton>
    </Panel>
  );
}

function DoorPanel({ door }: { door: Door }) {
  const { updateDoor, deleteSelection } = useStore.getState();
  if (door.kind === 'window') {
    return (
      <Panel title="Fenêtre sélectionnée">
        <NumberField label="Largeur" suffix="cm" value={Math.round(door.width)} min={40}
          onCommit={(v) => updateDoor(door.id, { width: v })} />
        <Presets values={[60, 100, 140, 240]} current={door.width}
          onPick={(v) => updateDoor(door.id, { width: v })} />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Allège" suffix="cm" value={Math.round(door.sill ?? 90)} min={0}
            onCommit={(v) => updateDoor(door.id, { sill: v })} />
          <NumberField label="Hauteur" suffix="cm" value={Math.round(door.height ?? 125)} min={30}
            onCommit={(v) => updateDoor(door.id, { height: v })} />
        </div>
        <SecondaryButton onClick={() => updateDoor(door.id, { sill: 20, height: 220 })}>
          Transformer en baie vitrée (toute hauteur)
        </SecondaryButton>
        <p className="-mt-2 text-xs text-slate-500">
          L'allège est la hauteur du bas de la fenêtre. Glisse la fenêtre pour la déplacer le long du mur.
        </p>
        <DeleteButton onClick={deleteSelection}>Supprimer la fenêtre</DeleteButton>
      </Panel>
    );
  }
  return (
    <Panel title="Porte sélectionnée">
      <NumberField label="Largeur" suffix="cm" value={Math.round(door.width)} min={40}
        onCommit={(v) => updateDoor(door.id, { width: v })} />
      <Presets values={[70, 80, 90, 100]} current={door.width}
        onPick={(v) => updateDoor(door.id, { width: v })} />
      <div className="grid grid-cols-2 gap-2">
        <SecondaryButton onClick={() => updateDoor(door.id, { flip: !door.flip })}>
          ⇅ Sens d'ouverture
        </SecondaryButton>
        <SecondaryButton onClick={() => updateDoor(door.id, { hingeAtEnd: !door.hingeAtEnd })}>
          ⇆ Côté des gonds
        </SecondaryButton>
      </div>
      <p className="-mt-2 text-xs text-slate-500">Glisse la porte pour la déplacer le long de son mur.</p>
      <DeleteButton onClick={deleteSelection}>Supprimer la porte</DeleteButton>
    </Panel>
  );
}

function StairPanel({ stair }: { stair: Stair }) {
  const { updateStair, deleteSelection } = useStore.getState();
  return (
    <Panel title="Escalier sélectionné">
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Largeur" suffix="cm" value={Math.round(stair.width)} min={60}
          onCommit={(v) => updateStair(stair.id, { width: v })} />
        <NumberField label="Longueur" suffix="cm" value={Math.round(stair.length)} min={100}
          onCommit={(v) => updateStair(stair.id, { length: v })} />
      </div>
      <SecondaryButton onClick={() => updateStair(stair.id, { rotation: (stair.rotation + 90) % 360 })}>
        ↻ Tourner de 90° (R)
      </SecondaryButton>
      <p className="-mt-2 text-xs text-slate-500">
        La flèche indique le sens de la montée. L'arrivée apparaît en pointillés sur le niveau du dessus.
      </p>
      <DeleteButton onClick={deleteSelection}>Supprimer l'escalier</DeleteButton>
    </Panel>
  );
}

function LevelSection() {
  const levels = useStore((s) => s.levels);
  const activeLevelId = useStore((s) => s.activeLevelId);
  const { renameLevel, deleteLevel } = useStore.getState();
  const level = levels.find((l) => l.id === activeLevelId)!;
  const [name, setName] = useState(level.name);
  useEffect(() => setName(level.name), [level.name]);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Niveau affiché</span>
        <input
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold outline-none focus:border-tp-navy"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => renameLevel(level.id, name)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </label>
      {levels.length > 1 && (
        <button
          type="button"
          onClick={() => deleteLevel(level.id)}
          className="cursor-pointer self-start text-xs font-semibold text-tp-red hover:underline"
        >
          Supprimer ce niveau
        </button>
      )}
    </div>
  );
}

function WallPanel({ wall }: { wall: Wall }) {
  const a = useStore((s) => s.points[wall.a]);
  const b = useStore((s) => s.points[wall.b]);
  const { setWallLength, setWallThickness, deleteSelection, toggleStructural } = useStore.getState();
  const length = distance(a, b);

  if (wall.structural) {
    return (
      <Panel title="Mur porteur">
        <LockNotice>
          Mur de fondation : il ne peut être ni déplacé, ni redimensionné, ni supprimé.
          Les cloisons accrochées dessus peuvent glisser le long.
        </LockNotice>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Longueur" value={formatLength(length)} />
          <Stat label="Épaisseur" value={`${wall.thickness} cm`} />
        </div>
        <WallColor wall={wall} />
        <button type="button" onClick={() => toggleStructural(wall.id)}
          className="cursor-pointer self-start text-xs font-semibold text-slate-500 hover:text-tp-navy hover:underline">
          Déverrouiller ce mur (ce n'est pas un mur porteur)
        </button>
      </Panel>
    );
  }

  return (
    <Panel title="Mur sélectionné">
      <NumberField label="Longueur" suffix="cm" value={Math.round(length)} min={1}
        onCommit={(v) => setWallLength(wall.id, v)} />
      <p className="-mt-2 text-xs text-slate-500">
        Le coin d'arrivée se déplace dans l'axe du mur ; les murs attachés suivent.
      </p>

      <ThicknessPicker value={wall.thickness} onChange={(t) => setWallThickness(wall.id, t)} />
      <WallColor wall={wall} />

      <DeleteButton onClick={deleteSelection}>Supprimer le mur</DeleteButton>
      <button type="button" onClick={() => toggleStructural(wall.id)}
        className="cursor-pointer self-start text-xs font-semibold text-slate-500 hover:text-tp-navy hover:underline">
        Marquer comme mur porteur (verrouillé)
      </button>
    </Panel>
  );
}

function WallColor({ wall }: { wall: Wall }) {
  const setWallColor = useStore((s) => s.setWallColor);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Couleur (visible en 3D)</span>
      <Swatches colors={WALL_COLORS} value={wall.color ?? DEFAULT_WALL_COLOR} onPick={(c) => setWallColor(wall.id, c)} />
      <CustomColor value={wall.color ?? DEFAULT_WALL_COLOR} onPick={(c) => setWallColor(wall.id, c)} />
    </div>
  );
}

function PointPanel({ point }: { point: Point }) {
  const connected = useStore(
    (s) => Object.values(s.walls).filter((w) => w.a === point.id || w.b === point.id).length,
  );
  const { setPointPosition, deleteSelection } = useStore.getState();
  const constraint = useStore((s) => pointConstraint(s, point.id).kind);

  if (constraint === 'locked') {
    return (
      <Panel title="Coin porteur">
        <LockNotice>Coin de mur porteur : il ne peut pas être déplacé.</LockNotice>
      </Panel>
    );
  }

  return (
    <Panel title="Coin sélectionné">
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="X" suffix="cm" value={Math.round(point.x)}
          onCommit={(v) => setPointPosition(point.id, v, point.y)} />
        <NumberField label="Y" suffix="cm" value={Math.round(point.y)}
          onCommit={(v) => setPointPosition(point.id, point.x, v)} />
      </div>
      <p className="text-sm text-slate-600">
        {connected} mur{connected > 1 ? 's' : ''} relié{connected > 1 ? 's' : ''} à ce coin.
      </p>
      {constraint === 'slide' ? (
        <p className="-mt-2 text-xs text-slate-500">Ce coin est accroché à un mur porteur : il glisse le long.</p>
      ) : (
        <DeleteButton onClick={deleteSelection}>Supprimer le coin et ses murs</DeleteButton>
      )}
    </Panel>
  );
}

function OverviewPanel() {
  const walls = useStore((s) => s.walls);
  const points = useStore((s) => s.points);
  const tool = useStore((s) => s.tool);
  const newWallThickness = useStore((s) => s.newWallThickness);
  const setNewWallThickness = useStore((s) => s.setNewWallThickness);

  const wallList = Object.values(walls);
  const total = wallList.reduce((sum, w) => sum + distance(points[w.a], points[w.b]), 0);

  const placing = useStore((s) => s.placing);
  const titles = {
    select: 'Plan',
    wall: 'Dessiner des murs',
    door: 'Poser une porte',
    window: 'Poser une fenêtre',
    stair: 'Poser un escalier',
    furniture: `Poser : ${CATALOG[placing].label}`,
  };

  return (
    <Panel title={titles[tool]}>
      <LevelSection />

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Murs" value={String(wallList.length)} />
        <Stat label="Longueur totale" value={formatLength(total)} />
      </div>

      {tool === 'wall' && (
        <ThicknessPicker label="Épaisseur des nouveaux murs" value={newWallThickness}
          onChange={setNewWallThickness} />
      )}

      {tool === 'select' && <ColorSection />}

      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Mode d'emploi</h3>
        <ul className="space-y-1.5 text-sm text-slate-600">
          {tool === 'door' ? (
            <Help k="Clic">sur un mur pour y poser une porte</Help>
          ) : tool === 'window' ? (
            <Help k="Clic">sur un mur pour y poser une fenêtre</Help>
          ) : tool === 'furniture' ? (
            <Help k="Clic">pour poser le meuble, puis R pour le tourner</Help>
          ) : tool === 'stair' ? (
            <Help k="Clic">pour poser un escalier, puis R pour le tourner</Help>
          ) : tool === 'wall' ? (
            <>
              <Help k="Clic">poser un point, puis le suivant</Help>
              <Help k="Maj">murs droits (horizontal / vertical)</Help>
              <Help k="Échap">terminer le tracé (ou double-clic)</Help>
              <li className="pt-1 text-xs text-slate-500">
                Cliquer sur un coin ou un mur existant s'y raccroche (jonction en T).
              </li>
            </>
          ) : (
            <>
              <Help k="Clic">sélectionner un mur, un coin, un meuble…</Help>
              <Help k="Glisser">déplacer l'élément</Help>
              <Help k="R">tourner un meuble ou un escalier</Help>
              <Help k="Suppr">supprimer la sélection</Help>
              <Help k="Molette">zoomer · glisser le fond pour se déplacer</Help>
            </>
          )}
          <Help k="⌘/Ctrl+Z">annuler</Help>
          <Help k="V M P F E">Sélection · Mur · Porte · Fenêtre · Escalier</Help>
        </ul>
      </div>

      <p className="text-xs text-slate-500">Le plan est sauvegardé automatiquement dans ce navigateur.</p>
    </Panel>
  );
}

/* ---------- Petits composants ---------- */

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5 p-5">
      <h2 className="font-display text-lg font-bold text-tp-navy">{title}</h2>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-tp-pearl p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-display text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

function Help({ k, children }: { k: string; children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <kbd className="shrink-0 rounded-md border border-slate-200 bg-tp-pearl px-1.5 text-xs font-semibold text-tp-navy">
        {k}
      </kbd>
      <span>{children}</span>
    </li>
  );
}

function ThicknessPicker({ label = 'Épaisseur', value, onChange }: {
  label?: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <NumberField label={label} suffix="cm" value={value} min={1} onCommit={onChange} />
      <div className="flex gap-1.5">
        {THICKNESS_PRESETS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className={`flex-1 cursor-pointer rounded-lg border px-2 py-1 text-xs font-semibold transition-colors ${
              value === t
                ? 'border-tp-navy bg-tp-navy text-white'
                : 'border-slate-200 text-tp-navy hover:bg-slate-100'
            }`}
          >
            {t === 10 ? 'Cloison' : t === 20 ? 'Standard' : 'Extérieur'} · {t}
          </button>
        ))}
      </div>
    </div>
  );
}

function NumberField({ label, suffix, value, min, onCommit }: {
  label: string; suffix?: string; value: number; min?: number; onCommit: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const commit = () => {
    const v = Number(text.replace(',', '.'));
    if (Number.isFinite(v) && (min === undefined || v >= min) && v !== value) onCommit(v);
    // Si la valeur est refusée (règles de construction), on réaffiche la valeur actuelle.
    setText(String(value));
  };

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <div className="flex items-center rounded-xl border border-slate-200 bg-white focus-within:border-tp-navy">
        <input
          className="w-full min-w-0 rounded-xl bg-transparent px-3 py-2 text-sm font-semibold tabular-nums outline-none"
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setText(String(value));
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        {suffix && <span className="pr-3 text-sm text-slate-400">{suffix}</span>}
      </div>
    </label>
  );
}

function Swatches({ colors, value, onPick, titles }: {
  colors: string[]; value?: string; onPick: (c: string) => void; titles?: Record<string, string>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          title={titles?.[c] ?? c}
          onClick={() => onPick(c)}
          className={`h-7 w-7 cursor-pointer rounded-full border transition-transform hover:scale-110 ${
            value?.toLowerCase() === c.toLowerCase() ? 'border-tp-navy ring-2 ring-tp-navy ring-offset-1' : 'border-slate-300'
          }`}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

function CustomColor({ value, onPick }: { value: string; onPick: (c: string) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-500 hover:text-tp-navy">
      <input type="color" value={value} onChange={(e) => onPick(e.target.value)}
        className="h-6 w-8 cursor-pointer rounded border border-slate-200 bg-transparent p-0" />
      Autre couleur…
    </label>
  );
}

function LockNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-xl border border-slate-200 bg-tp-pearl p-3 text-sm text-slate-600">
      <svg className="mt-0.5 h-4 w-4 shrink-0 text-tp-navy" fill="none" stroke="currentColor" strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 018 0v4" />
      </svg>
      <span>{children}</span>
    </div>
  );
}

function Presets({ values, current, onPick }: { values: number[]; current: number; onPick: (v: number) => void }) {
  return (
    <div className="-mt-2 flex gap-1.5">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onPick(v)}
          className={`flex-1 cursor-pointer rounded-lg border px-2 py-1 text-xs font-semibold transition-colors ${
            current === v ? 'border-tp-navy bg-tp-navy text-white' : 'border-slate-200 text-tp-navy hover:bg-slate-100'
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function SecondaryButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-tp-navy transition-colors hover:bg-slate-100"
    >
      {children}
    </button>
  );
}

function DeleteButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-tp-red transition-colors hover:bg-red-50"
    >
      {children}
    </button>
  );
}
