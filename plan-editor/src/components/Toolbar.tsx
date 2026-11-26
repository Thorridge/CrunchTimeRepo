import { useEffect, useRef, useState, type ReactNode } from 'react';
import { parseProject, snapshot, useStore, type Tool } from '../store';
import { TEMPLATES } from '../templates';

const TOOLS: { id: Tool; label: string; key: string; icon: string }[] = [
  { id: 'select', label: 'Sélection', key: 'V', icon: 'M5 3l14 8-6 2-2 6z' },
  { id: 'wall', label: 'Mur', key: 'M', icon: 'M4 20L20 4M4 20h4M4 20v-4' },
  { id: 'door', label: 'Porte', key: 'P', icon: 'M4 20h16M6 20V4h9v16M12 12h.01' },
  { id: 'stair', label: 'Escalier', key: 'E', icon: 'M4 20h4v-4h4v-4h4V8h4' },
];

export function Toolbar() {
  const tool = useStore((s) => s.tool);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const { setTool, undo, redo, requestFit, clearLevel, loadProject } = useStore.getState();
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
          <ToolButton key={t.id} active={tool === t.id} onClick={() => setTool(t.id)} title={`${t.label} (${t.key})`}>
            <Icon d={t.icon} /> {t.label}
          </ToolButton>
        ))}
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
    </div>
  );
}

function TemplatePicker({ onPick }: { onPick: (id: string) => void }) {
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
