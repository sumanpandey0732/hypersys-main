import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, MessageSquare, Trash2, LogOut, ChevronLeft, Sparkles, Bot, ChevronDown, ChevronUp, Search, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { format, isToday, isYesterday, differenceInCalendarDays } from 'date-fns';

export interface AIModel {
  id: string;
  name: string;
  label: string;
  description: string;
  emoji: string;
  kind: 'Chat' | 'Vision' | 'Image';
  featured?: boolean;
}

export const AI_MODELS: AIModel[] = [
  // Featured chat models
  { id: 'default', name: 'Aetheris', label: 'Aetheris', description: 'Balanced flagship assistant', emoji: '✨', kind: 'Chat', featured: true },
  { id: 'nv-glm', name: 'GLM 5.2', label: 'GLM', description: 'Fast general language model', emoji: '🧬', kind: 'Chat', featured: true },
  { id: 'nv-deepseek', name: 'DeepSeek V4 Pro', label: 'DeepSeek', description: 'Deep reasoning (slower)', emoji: '🧠', kind: 'Chat', featured: true },
  { id: 'nv-kimi', name: 'Kimi K2.6', label: 'Kimi', description: 'Long-context chat', emoji: '🌙', kind: 'Chat', featured: true },
  { id: 'ms-large', name: 'Mistral Large', label: 'Mistral Large', description: 'Mistral flagship reasoning', emoji: '🇫🇷', kind: 'Chat', featured: true },
  { id: 'nv-llama32-11b-vision', name: 'Llama 3.2 Vision', label: 'Llama Vision', description: 'Analyze & describe images', emoji: '👁️', kind: 'Vision', featured: true },
  { id: 'nv-qwen-image', name: 'Image Studio', label: 'Image Studio', description: 'Generate images from text', emoji: '🎨', kind: 'Image', featured: true },

  // More chat models
  { id: 'nv-minimax', name: 'MiniMax M3', label: 'MiniMax', description: 'Advanced MoE reasoning', emoji: '⚡', kind: 'Chat', featured: false },
  { id: 'nv-deepseek-flash', name: 'DeepSeek V4 Flash', label: 'DeepSeek Flash', description: 'Fast reasoning model', emoji: '💨', kind: 'Chat', featured: false },
  { id: 'nv-qwen3-next', name: 'Qwen3 Next 80B', label: 'Qwen Next', description: 'Efficient large model', emoji: '🌀', kind: 'Chat', featured: false },
  { id: 'nv-qwen35-397b', name: 'Qwen 3.5 397B', label: 'Qwen 397B', description: 'Massive language model', emoji: '🔮', kind: 'Chat', featured: false },
  { id: 'nv-llama33-70b', name: 'Llama 3.3 70B', label: 'Llama 3.3', description: 'Meta flagship instruct', emoji: '🦙', kind: 'Chat', featured: false },
  { id: 'ms-small', name: 'Mistral Small', label: 'Mistral Small', description: 'Fast, low-cost Mistral', emoji: '🥐', kind: 'Chat', featured: false },
  { id: 'ms-codestral', name: 'Codestral', label: 'Codestral', description: 'Mistral coding specialist', emoji: '💻', kind: 'Chat', featured: false },
  { id: 'ms-nemo', name: 'Mistral Nemo', label: 'Mistral Nemo', description: 'Compact multilingual model', emoji: '🔷', kind: 'Chat', featured: false },

  // More vision models
  { id: 'nv-llama32-90b-vision', name: 'Llama 3.2 90B Vision', label: 'Llama 90B Vision', description: 'High-detail image understanding', emoji: '🔬', kind: 'Vision', featured: false },
  { id: 'nv-cosmos-reason', name: 'Cosmos Reason 8B', label: 'Cosmos', description: 'Visual reasoning model', emoji: '🌌', kind: 'Vision', featured: false },
  { id: 'nv-nemotron-vl', name: 'Nemotron Nano VL', label: 'Nemotron VL', description: 'Efficient vision processing', emoji: '🦁', kind: 'Vision', featured: false },

  // Image generation styles (all route through the image engine)
  { id: 'nv-sd35-large', name: 'Photoreal', label: 'Photoreal', description: 'Detailed photorealistic images', emoji: '🖼️', kind: 'Image', featured: false },
  { id: 'nv-flux2-klein', name: 'Artistic', label: 'Artistic', description: 'Creative & stylized images', emoji: '🎈', kind: 'Image', featured: false },
];



interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ChatSidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  selectedModel: string;
  onSelectModel: (id: string) => void;
}

export default function ChatSidebar({
  conversations, activeConversationId, onSelectConversation,
  onNewConversation, onDeleteConversation, isCollapsed, onToggleCollapse,
  selectedModel, onSelectModel,
}: ChatSidebarProps) {
  const { user, signOut } = useAuth();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showAllModels, setShowAllModels] = useState(false);
  const [modelPanelOpen, setModelPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const selectedModelMeta = AI_MODELS.find((m) => m.id === selectedModel) || AI_MODELS[0];

  const filteredModels = AI_MODELS.filter((model) =>
    model.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    model.description.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const visibleModels = showAllModels ? filteredModels : filteredModels.filter((model) => model.featured);

  // Group conversations by recency for a cleaner, scannable history list.
  const groupLabel = (dateStr: string): string => {
    const d = new Date(dateStr);
    if (isToday(d)) return 'Today';
    if (isYesterday(d)) return 'Yesterday';
    if (differenceInCalendarDays(new Date(), d) < 7) return 'Previous 7 days';
    if (differenceInCalendarDays(new Date(), d) < 30) return 'Previous 30 days';
    return 'Older';
  };
  const GROUP_ORDER = ['Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', 'Older'];
  const groupedConversations = GROUP_ORDER
    .map((label) => ({ label, items: conversations.filter((c) => groupLabel(c.updated_at) === label) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <AnimatePresence>
        {!isCollapsed && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden" onClick={onToggleCollapse} />
        )}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={{ width: isCollapsed ? 0 : 280, x: isCollapsed ? -280 : 0 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="fixed lg:relative h-screen liquid-sidebar border-r border-sidebar-border z-50 flex flex-col overflow-hidden"
      >
        <div className="flex flex-col h-full w-[280px]">
          <div className="p-4 border-b border-sidebar-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl liquid-icon flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <span className="font-display font-bold text-lg gradient-text">
                  {AI_MODELS.find(m => m.id === selectedModel)?.name || 'AI'}
                </span>
              </div>
              <button onClick={onToggleCollapse} className="p-2 rounded-lg hover:bg-sidebar-accent transition-colors lg:block hidden" aria-label="Collapse sidebar">
                <ChevronLeft className="w-5 h-5 text-sidebar-foreground/70" />
              </button>
            </div>
          </div>

          <div className="p-4 space-y-3 flex-shrink-0">
            <Button onClick={onNewConversation} className="w-full liquid-control text-primary border border-primary/20 justify-start gap-3 py-5">
              <Plus className="w-5 h-5" /> New Chat
            </Button>

            {/* Model Selector — collapsible so History always has room.
                The full model picker also lives in the chat header. */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setModelPanelOpen((v) => !v)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-sidebar-border/50 bg-sidebar-accent/20 hover:bg-sidebar-accent/40 transition-colors"
                aria-expanded={modelPanelOpen}
              >
                <Bot className="w-4 h-4 text-primary/70 flex-shrink-0" />
                <span className="flex flex-col items-start min-w-0 flex-1">
                  <span className="text-[10px] font-medium text-sidebar-foreground/45 uppercase tracking-wider leading-none">AI Model</span>
                  <span className="text-sm font-semibold text-sidebar-foreground truncate max-w-full mt-0.5">
                    {selectedModelMeta.emoji} {selectedModelMeta.label}
                  </span>
                </span>
                <ChevronDown className={`w-4 h-4 text-sidebar-foreground/50 transition-transform duration-300 flex-shrink-0 ${modelPanelOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence initial={false}>
                {modelPanelOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-2 pt-1">
                      {/* Search input for AI models */}
                      <div className="relative group px-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-sidebar-foreground/45 group-focus-within:text-primary transition-colors" />
                        <input
                          type="text"
                          placeholder="Search models..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 bg-sidebar-accent/20 hover:bg-sidebar-accent/40 border border-sidebar-border/40 focus:border-primary/40 focus:ring-1 focus:ring-primary/20 rounded-lg text-xs text-sidebar-foreground placeholder:text-sidebar-foreground/30 focus:outline-none transition-all"
                        />
                      </div>

                      <div className="space-y-1 max-h-[26vh] overflow-y-auto pr-1 scrollbar-thin">
                        {visibleModels.map((model) => (
                          <button
                            key={model.id}
                            onClick={() => onSelectModel(model.id)}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all duration-200 text-sm liquid-model-button
                              ${selectedModel === model.id
                                ? 'bg-primary/15 text-primary border border-primary/25 shadow-sm shadow-primary/10'
                                : 'hover:bg-sidebar-accent/50 text-sidebar-foreground/70 hover:text-sidebar-foreground border border-transparent'
                              }`}
                          >
                            <span className="text-base">{model.emoji}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium truncate">{model.label}</span>
                                <span className="text-[10px] text-sidebar-foreground/40 truncate">{model.kind}</span>
                              </div>
                              <p className="text-[11px] text-sidebar-foreground/45 truncate">{model.description}</p>
                            </div>
                            {selectedModel === model.id && (
                              <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                      {AI_MODELS.length > AI_MODELS.filter((model) => model.featured).length && (
                        <button
                          type="button"
                          onClick={() => setShowAllModels((prev) => !prev)}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/40 transition-colors"
                        >
                          {showAllModels ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          {showAllModels ? 'Show less' : `Show all ${AI_MODELS.length} models`}
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-3 pb-4">
            <div className="flex items-center gap-2 px-2 mb-2 sticky top-0 z-10 py-1.5 bg-gradient-to-b from-[hsl(224_36%_4%)] to-transparent">
              <History className="w-3.5 h-3.5 text-sidebar-foreground/50" />
              <p className="text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider">History</p>
              {conversations.length > 0 && (
                <span className="ml-auto text-[10px] font-semibold text-primary/70 bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">
                  {conversations.length}
                </span>
              )}
            </div>

            {conversations.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center text-center py-12 px-4"
              >
                <div className="w-12 h-12 rounded-2xl liquid-icon flex items-center justify-center mb-3">
                  <MessageSquare className="w-5 h-5 text-primary/70" />
                </div>
                <p className="text-sm font-medium text-sidebar-foreground/60">No conversations yet</p>
                <p className="text-xs text-sidebar-foreground/35 mt-1">Start a new chat to see it here</p>
              </motion.div>
            ) : (
              <div className="space-y-3">
                {groupedConversations.map((group) => (
                  <div key={group.label} className="space-y-1">
                    <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/35">{group.label}</p>
                    <AnimatePresence>
                      {group.items.map((conv) => (
                        <motion.div key={conv.id}
                          layout
                          initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                          onMouseEnter={() => setHoveredId(conv.id)} onMouseLeave={() => setHoveredId(null)}
                          onClick={() => onSelectConversation(conv.id)}
                          className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200 border
                            ${activeConversationId === conv.id
                              ? 'bg-gradient-to-r from-primary/15 to-primary/5 text-sidebar-foreground border-primary/25 shadow-sm shadow-primary/10'
                              : 'border-transparent hover:bg-sidebar-accent/50 text-sidebar-foreground/70 hover:text-sidebar-foreground'}`}
                        >
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors
                            ${activeConversationId === conv.id ? 'bg-primary/20 text-primary' : 'bg-sidebar-accent/40 text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80'}`}>
                            <MessageSquare className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate font-medium">{conv.title}</p>
                            <p className="text-[11px] text-sidebar-foreground/40">{format(new Date(conv.updated_at), 'MMM d, h:mm a')}</p>
                          </div>
                          {hoveredId === conv.id && (
                            <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                              onClick={(e) => { e.stopPropagation(); onDeleteConversation(conv.id); }}
                              className="absolute right-2 p-1.5 rounded-lg bg-background/40 hover:bg-destructive/20 text-sidebar-foreground/50 hover:text-destructive transition-colors"
                              aria-label="Delete conversation">
                              <Trash2 className="w-3.5 h-3.5" />
                            </motion.button>
                          )}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-sidebar-border">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-sidebar-accent/30">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="Profile" className="w-9 h-9 rounded-full object-cover border border-primary/20" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-sm font-medium text-primary">{(user?.displayName || user?.email || '?').charAt(0).toUpperCase()}</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-sidebar-foreground">{user?.displayName || user?.email}</p>
                {user?.displayName && user?.email && (
                  <p className="text-xs text-sidebar-foreground/40 truncate">{user.email}</p>
                )}
              </div>
              <button onClick={() => signOut()} className="p-2 rounded-lg hover:bg-destructive/20 text-sidebar-foreground/60 hover:text-destructive transition-colors" title="Sign out">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </motion.aside>
    </>
  );
}
