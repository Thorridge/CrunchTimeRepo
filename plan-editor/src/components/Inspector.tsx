import { useEffect, useState, type ReactNode } from 'react';
import { useStore, type Door, type Point, type Stair, type Wall } from '../store';
import { distance, formatLength } from '../geometry';

const THICKNESS_PRESETS = [10, 20, 30];

export function Inspector() {
  const selection = useStore((s) => s.selection);
  const walls = useStore((s) => s.walls);
  const points = useStore((s) => s.points);
  const doors = useStore((s) => s.doors);
  const stairs = useStore((s) => s.stairs);

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

function DoorPanel({ door }: { door: Door }) {
  const { updateDoor, deleteSelection } = useStore.getState();
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
  const { setWallLength, setWallThickness, deleteSelection } = useStore.getState();
  const length = distance(a, b);

  return (
    <Panel title="Mur sélectionné">
      <NumberField label="Longueur" suffix="cm" value={Math.round(length)} min={1}
        onCommit={(v) => setWallLength(wall.id, v)} />
      <p className="-mt-2 text-xs text-slate-500">
        Le coin d'arrivée se déplace dans l'axe du mur ; les murs attachés suivent.
      </p>

      <ThicknessPicker value={wall.thickness} onChange={(t) => setWallThickness(wall.id, t)} />

      <DeleteButton onClick={deleteSelection}>Supprimer le mur</DeleteButton>
    </Panel>
  );
}

function PointPanel({ point }: { point: Point }) {
  const connected = useStore(
    (s) => Object.values(s.walls).filter((w) => w.a === point.id || w.b === point.id).length,
  );
  const { setPointPosition, deleteSelection } = useStore.getState();

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
      <DeleteButton onClick={deleteSelection}>Supprimer le coin et ses murs</DeleteButton>
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

  const titles = { select: 'Plan', wall: 'Dessiner des murs', door: 'Poser une porte', stair: 'Poser un escalier' };

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

      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Mode d'emploi</h3>
        <ul className="space-y-1.5 text-sm text-slate-600">
          {tool === 'door' ? (
            <Help k="Clic">sur un mur pour y poser une porte</Help>
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
              <Help k="Clic">sélectionner un mur ou un coin</Help>
              <Help k="Glisser">déplacer un mur ou un coin</Help>
              <Help k="Suppr">supprimer la sélection</Help>
              <Help k="Molette">zoomer · glisser le fond pour se déplacer</Help>
            </>
          )}
          <Help k="⌘/Ctrl+Z">annuler</Help>
          <Help k="V M P E">Sélection · Mur · Porte · Escalier</Help>
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
    else setText(String(value));
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
