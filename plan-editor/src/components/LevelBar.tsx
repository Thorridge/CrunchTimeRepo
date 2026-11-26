import { useStore } from '../store';

/** Onglets des niveaux, affichés en bas à gauche du plan (du plus haut au plus bas). */
export function LevelBar() {
  const levels = useStore((s) => s.levels);
  const activeLevelId = useStore((s) => s.activeLevelId);
  const { switchLevel, addLevel } = useStore.getState();

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-10">
      <div className="pointer-events-auto flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-lg backdrop-blur">
        <span className="px-2 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Niveaux</span>
        {[...levels].reverse().map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => switchLevel(l.id)}
            className={`cursor-pointer rounded-lg px-3 py-1.5 text-left text-sm font-semibold transition-colors ${
              l.id === activeLevelId ? 'bg-tp-navy text-white' : 'text-tp-navy hover:bg-slate-100'
            }`}
          >
            {l.name}
          </button>
        ))}
        <button
          type="button"
          onClick={addLevel}
          title="Ajoute un étage tout en haut (reprend les murs extérieurs du niveau affiché)"
          className="cursor-pointer rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-left text-sm font-semibold text-slate-500 transition-colors hover:border-tp-navy hover:text-tp-navy"
        >
          + Ajouter un étage
        </button>
      </div>
    </div>
  );
}
