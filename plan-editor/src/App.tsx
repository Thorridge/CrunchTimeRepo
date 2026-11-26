import { PlanCanvas } from './components/PlanCanvas';
import { Toolbar } from './components/Toolbar';
import { Inspector } from './components/Inspector';
import { LevelBar } from './components/LevelBar';
import { Scene3D } from './components/Scene3D';
import { useStore } from './store';

/** Intégré dans une page du site (iframe) : on masque l'en-tête. */
const embedded = window.self !== window.top;

export default function App() {
  const mode = useStore((s) => s.mode);
  return (
    <div className="flex h-full flex-col">
      {!embedded && (
      <header className="flex items-center justify-between gap-4 bg-tp-navy px-4 py-3 text-white">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-tp-red font-display text-sm font-extrabold">
            TP
          </div>
          <div>
            <div className="font-display text-base font-bold leading-tight">Éditeur de plan</div>
            <div className="text-xs text-white/60">Thomas &amp; Piron</div>
          </div>
        </div>
        <a
          href="../Maquette-Version-2-CLIENT.html#configurateur"
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 px-3 py-2 text-xs font-semibold transition-colors hover:bg-white/10"
        >
          ← <span className="hidden sm:inline">Retour au site</span>
        </a>
      </header>
      )}

      <Toolbar />

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <main className="relative min-h-[60vh] flex-1 md:min-h-0">
          {mode === '3d' ? <Scene3D /> : <PlanCanvas />}
          <LevelBar />
        </main>
        <aside className="overflow-y-auto border-t border-slate-200 bg-white md:w-80 md:border-t-0 md:border-l">
          <Inspector />
        </aside>
      </div>
    </div>
  );
}
