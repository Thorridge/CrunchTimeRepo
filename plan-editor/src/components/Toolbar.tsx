import { useEffect, useRef, useState, type ReactNode } from 'react';
import { parseProject, snapshot, useStore, type Tool } from '../store';
import { TEMPLATES } from '../templates';
import { CATALOG, FURNITURE_TYPES } from '../furniture';

const TOOLS: { id: Tool; label: string; key: string; icon: string }[] = [
  { id: 'select', label: 'Sélection', key: 'V', icon: 'M5 3l14 8-6 2-2 6z' },
  { id: 'wall', label: 'Mur', key: 'M', icon: 'M4 20L20 4M4 20h4M4 20v-4' },
  { id: 'door', label: 'Porte', key: 'P', icon: 'M4 20h16M6 20V4h9v16M12 12h.01' },
  { id: 'window', label: 'Fenêtre', key: 'F', icon: 'M4 4h16v16H4zM12 4v16M4 12h16' },
  { id: 'stair', label: 'Escalier', key: 'E', icon: 'M4 20h4v-4h4v-4h4V8h4' },
];

export function Toolbar() {
  const tool = useStore((s) => s.tool);
  const mode = useStore((s) => s.mode);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const placing = useStore((s) => s.placing);
  const { setTool, setMode, startPlacing, undo, redo, requestFit, clearLevel, loadProject } = useStore.getState();
  const embedded = window.self !== window.top;
  const fileInput = useRef<HTMLInputElement>(null);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(snapshot(useStore.getState()), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plan.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file: File) => {
    try {
      const project = parseProject(JSON.parse(await file.text()));
      if (!project) throw new Error('format');
      loadProject(project);
    } catch {
      window.alert("Ce fichier n'est pas un plan valide.");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
      <Group>
        {TOOLS.map((t) => (
          <ToolButton key={t.id} active={mode === '2d' && tool === t.id} onClick={() => setTool(t.id)} title={`${t.label} (${t.key})`}>
            <Icon d={t.icon} /> {t.label}
          </ToolButton>
        ))}
        <FurniturePicker active={mode === '2d' && tool === 'furniture'} current={placing} onPick={startPlacing} />
      </Group>

      <Group>
        <ToolButton onClick={undo} disabled={!canUndo} title="Annuler (Ctrl/⌘+Z)">
          <Icon d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3" />
        </ToolButton>
        <ToolButton onClick={redo} disabled={!canRedo} title="Rétablir (Ctrl/⌘+Maj+Z)">
          <Icon d="M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3" />
        </ToolButton>
        <ToolButton onClick={requestFit} title="Recentrer le plan">
          <Icon d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </ToolButton>
      </Group>

      <Group>
        <ToolButton onClick={clearLevel} title="Vider le niveau affiché">
          Vider
        </ToolButton>
        <TemplatePicker onPick={(id) => loadProject(TEMPLATES.find((t) => t.id === id)!.build())} />
      </Group>

      <Group>
        <ToolButton onClick={exportJson} title="Télécharger le projet (JSON)">
          <Icon d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" /> Exporter
        </ToolButton>
        <ToolButton onClick={() => fileInput.current?.click()} title="Ouvrir un projet (JSON)">
          <Icon d="M12 15V4m0 0L8 8m4-4l4 4M5 20h14" /> Importer
        </ToolButton>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importJson(file);
            e.target.value = '';
          }}
        />
      </Group>

      <div className="ml-auto flex items-center gap-2">
        {embedded && (
          <ToolButton onClick={() => window.open(window.location.href, '_blank')} title="Ouvrir le configurateur en plein écran">
            <Icon d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" /> Plein écran
          </ToolButton>
        )}
        <button
          type="button"
          onClick={() => setMode(mode === '3d' ? '2d' : '3d')}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-tp-red px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-tp-red-dark"
        >
          <Icon d={mode === '3d' ? 'M4 4h16v16H4zM4 12h16M12 4v16' : 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5'} />
          {mode === '3d' ? 'Revenir au plan 2D' : 'Voir en 3D'}
        </button>
      </div>
    </div>
  );
}

/** Menu déroulant qui se ferme au clic extérieur ou avec Échap. */
function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return { open, setOpen, ref };
}

function FurniturePicker({ active, current, onPick }: {
  active: boolean; current: string; onPick: (type: (typeof FURNITURE_TYPES)[number]) => void;
}) {
  const { open, setOpen, ref } = useDropdown();
  return (
    <div ref={ref} className="relative">
      <ToolButton active={active || open} onClick={() => setOpen((o) => !o)} title="Ajouter un meuble">
        <Icon d="M4 11V8a2 2 0 012-2h12a2 2 0 012 2v3M2 11h20v6H2zM5 17v2M19 17v2" /> Mobilier
        <Icon d="M6 9l6 6 6-6" />
      </ToolButton>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
          <p className="px-2 pb-2 pt-1 text-xs text-slate-500">Choisis un meuble puis clique sur le plan pour le poser.</p>
          <div className="grid grid-cols-2 gap-1.5">
            {FURNITURE_TYPES.map((type) => {
              const c = CATALOG[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    onPick(type);
                    setOpen(false);
                  }}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors hover:bg-tp-pearl ${
                    active && current === type ? 'border-tp-navy' : 'border-slate-200'
                  }`}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-tp-navy" style={{ background: c.color }}>
                    <Icon d={c.icon} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-tp-navy">{c.label}</span>
                    <span className="block text-[11px] text-slate-500">{c.width} × {c.depth} cm</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TemplatePicker({ onPick }: { onPick: (id: string) => void }) {
  const { open, setOpen, ref } = useDropdown();

  return (
    <div ref={ref} className="relative">
      <ToolButton active={open} onClick={() => setOpen((o) => !o)} title="Choisir un modèle prédéfini">
        <Icon d="M4 10l8-6 8 6v10H4zM10 20v-6h4v6" /> Modèles
        <Icon d="M6 9l6 6 6-6" />
      </ToolButton>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
          <p className="px-2 pb-2 pt-1 text-xs text-slate-500">
            Remplace le projet actuel (annulable avec ⌘/Ctrl+Z).
          </p>
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                onPick(t.id);
                setOpen(false);
              }}
              className="flex w-full cursor-pointer flex-col items-start rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-tp-pearl"
            >
              <span className="font-display text-sm font-bold text-tp-navy">{t.name}</span>
              <span className="text-xs text-slate-500">{t.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Group({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-1 rounded-xl bg-tp-pearl p-1">{children}</div>;
}

function ToolButton({ active, disabled, onClick, title, children }: {
  active?: boolean; disabled?: boolean; onClick: () => void; title: string; children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
        active ? 'bg-tp-navy text-white' : 'text-tp-navy hover:bg-slate-200/70'
      }`}
    >
      {children}
    </button>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d={d} />
    </svg>
  );
}
