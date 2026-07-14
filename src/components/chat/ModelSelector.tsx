import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Search, Check } from 'lucide-react';
import { AI_MODELS, type AIModel } from '@/components/chat/ChatSidebar';

interface ModelSelectorProps {
  selectedModel: string;
  onSelectModel: (id: string) => void;
}

const KIND_ORDER: AIModel['kind'][] = ['Chat', 'Vision', 'Image'];
const KIND_META: Record<AIModel['kind'], { label: string; emoji: string }> = {
  Chat: { label: 'Chat', emoji: '💬' },
  Vision: { label: 'Vision', emoji: '👁️' },
  Image: { label: 'Image', emoji: '🎨' },
};

// A polished, glassy replacement for the native <select> in the chat header.
export default function ModelSelector({ selectedModel, onSelectModel }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const active = AI_MODELS.find((m) => m.id === selectedModel) || AI_MODELS[0];

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    // Focus the search field when opening.
    const t = setTimeout(() => searchRef.current?.focus(), 60);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = AI_MODELS.filter((m) =>
      !q ||
      m.label.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q),
    );
    return KIND_ORDER
      .map((kind) => ({ kind, models: matches.filter((m) => m.kind === kind) }))
      .filter((g) => g.models.length > 0);
  }, [query]);

  const handleSelect = (id: string) => {
    onSelectModel(id);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger */}
      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        whileTap={{ scale: 0.97 }}
        className="liquid-select group flex items-center gap-2 rounded-xl border border-border/40 pl-2.5 pr-2 py-1.5 hover:border-primary/40 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 max-w-[190px] sm:max-w-none"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select AI model"
      >
        <span className="text-base leading-none">{active.emoji}</span>
        <span className="flex flex-col items-start min-w-0 leading-tight">
          <span className="text-xs sm:text-sm font-semibold text-foreground/90 truncate max-w-[110px] sm:max-w-[160px]">{active.label}</span>
          <span className="text-[10px] text-muted-foreground/60 -mt-0.5">{active.kind}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-foreground/50 transition-transform duration-300 ${open ? 'rotate-180 text-primary' : ''}`} />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 mt-2 w-[300px] max-w-[calc(100vw-2rem)] z-50 glass-panel rounded-2xl overflow-hidden shadow-2xl"
            role="listbox"
          >
            {/* Search */}
            <div className="p-2.5 border-b border-white/5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search models…"
                  className="w-full pl-9 pr-3 py-2 bg-secondary/40 border border-border/40 focus:border-primary/40 focus:ring-1 focus:ring-primary/20 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none transition-all"
                />
              </div>
            </div>

            {/* Options */}
            <div className="max-h-[52vh] overflow-y-auto scrollbar-thin p-1.5">
              {grouped.length === 0 && (
                <p className="text-center text-sm text-muted-foreground/50 py-8">No models found</p>
              )}
              {grouped.map(({ kind, models }) => (
                <div key={kind} className="mb-1 last:mb-0">
                  <p className="px-2.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/45">
                    {KIND_META[kind].emoji} {KIND_META[kind].label}
                  </p>
                  {models.map((m) => {
                    const isActive = m.id === selectedModel;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        onClick={() => handleSelect(m.id)}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-all duration-200
                          ${isActive
                            ? 'bg-primary/15 border border-primary/25 shadow-sm shadow-primary/10'
                            : 'border border-transparent hover:bg-secondary/60'
                          }`}
                      >
                        <span className="text-lg leading-none flex-shrink-0">{m.emoji}</span>
                        <span className="flex-1 min-w-0">
                          <span className={`block text-sm font-medium truncate ${isActive ? 'text-primary' : 'text-foreground/90'}`}>{m.name}</span>
                          <span className="block text-[11px] text-muted-foreground/50 truncate">{m.description}</span>
                        </span>
                        {isActive && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
