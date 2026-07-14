import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { firestoreDb } from '@/lib/firestore-db';
import ChatSidebar, { AI_MODELS } from '@/components/chat/ChatSidebar';
import ChatMessage from '@/components/chat/ChatMessage';
import ChatInput from '@/components/chat/ChatInput';
import ModelSelector from '@/components/chat/ModelSelector';
import WelcomeScreen from '@/components/chat/WelcomeScreen';
import { generateChatResponse, generateImageResponse, isVisionModel, SLOW_MODEL_IDS, type ChatMessage as AiChatMessage } from '@/lib/ai';
import { shouldWebSearch, webSearch, buildSearchContext } from '@/lib/search';
import type { ChatAttachment } from '@/components/chat/types';
import { Menu, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { extractFirstMarkdownImage, isImageGenerationRequest, sanitizeAssistantText } from '@/lib/chat-format';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  attachments?: ChatAttachment[];
  modelName?: string;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  modelId?: string;
}

const REQUEST_TIMEOUT_MS = 60_000;
const SLOW_REQUEST_TIMEOUT_MS = 120_000;
const DEFAULT_VISION_MODEL = 'nv-llama32-11b-vision';

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });

export default function Chat() {
  const { user, isGuest } = useAuth();
  const [accentColor, setAccentColor] = useState(() => localStorage.getItem('aetheris_theme_color') || '172 66% 50%');

  useEffect(() => {
    localStorage.setItem('aetheris_theme_color', accentColor);
    document.documentElement.style.setProperty('--primary', accentColor);
    document.documentElement.style.setProperty('--ring', accentColor);
    document.documentElement.style.setProperty('--accent', accentColor);
    document.documentElement.style.setProperty('--sidebar-primary', accentColor);
  }, [accentColor]);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [selectedModel, setSelectedModel] = useState('default');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    const data = await firestoreDb.getConversations(user.uid);
    setConversations(data.map(c => ({
      id: c.id,
      title: c.title,
      created_at: c.createdAt,
      updated_at: c.updatedAt,
      modelId: c.modelId
    })) || []);
  }, [user]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const loadMessages = useCallback(async () => {
    if (!activeConversationId) { setMessages([]); return; }
    const data = await firestoreDb.getMessages(activeConversationId);
    setMessages(data.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      imageUrl: m.role === 'assistant' ? extractFirstMarkdownImage(m.content) : undefined,
      attachments: m.attachments,
      modelName: m.modelName,
    })) || []);
  }, [activeConversationId]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  // Restore the selected model when switching conversations
  useEffect(() => {
    if (activeConversationId) {
      const activeConv = conversations.find(c => c.id === activeConversationId);
      if (activeConv?.modelId) {
        setSelectedModel(activeConv.modelId);
      }
    }
  }, [activeConversationId, conversations]);

  const handleSelectModel = async (modelId: string) => {
    setSelectedModel(modelId);
    if (activeConversationId && user && !isGuest) {
      try {
        await firestoreDb.updateConversationModel(activeConversationId, modelId);
        setConversations(prev => prev.map(c => c.id === activeConversationId ? { ...c, modelId } : c));
      } catch (e) {
        console.error("Failed to update conversation model:", e);
      }
    }
  };

  const createConversation = async (firstMessage: string): Promise<string | null> => {
    if (!user) return null;
    const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? '...' : '');
    try {
      const convId = await firestoreDb.createConversation(user.uid, title, selectedModel);
      setConversations((prev) => [
        { id: convId, title, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), modelId: selectedModel },
        ...prev
      ]);
      return convId;
    } catch (e) {
      console.error(e);
      toast.error('Failed to create conversation');
      return null;
    }
  };

  const saveMessage = async (
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    modelName?: string,
    attachments?: ChatAttachment[]
  ) => {
    if (!user) return;
    try {
      await firestoreDb.saveMessage(conversationId, user.uid, role, content, modelName, attachments);
    } catch (e) {
      console.error("Error saving message:", e);
    }
  };

  const handleSendMessage = async (content: string, files: File[] = []) => {
    if ((!content.trim() && files.length === 0) || isLoading) return;

    const trimmedContent = content.trim();
    const pendingAttachments: ChatAttachment[] = await Promise.all(
      files.map(async (file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        url: await fileToDataUrl(file),
        type: file.type.startsWith('image/') ? 'image' as const : 'file' as const,
        mimeType: file.type,
        size: file.size,
      })),
    );

    const requestContent = trimmedContent || (pendingAttachments.length > 0 ? 'Describe this image in detail.' : '');

    let convId = activeConversationId;
    const isAuthenticated = !!user && !isGuest;

    if (!convId && isAuthenticated) {
      convId = await createConversation(trimmedContent || pendingAttachments[0]?.name || 'New chat');
      if (!convId) return;
    }

    const selectedModelMeta = AI_MODELS.find((model) => model.id === selectedModel) || AI_MODELS[0];
    const imageAttachments = pendingAttachments.filter((a) => a.type === 'image');
    const hasImages = imageAttachments.length > 0;

    // Route the request:
    //  - explicit Image model, or a text-to-image phrase (with no uploaded image) => generate
    //  - otherwise chat/vision. If images are attached but the model can't see,
    //    transparently use a vision model for this turn.
    const isImageGen =
      selectedModelMeta.kind === 'Image' ||
      (!hasImages && isImageGenerationRequest(requestContent));

    let effectiveModelId = selectedModel;
    if (!isImageGen && hasImages && !isVisionModel(selectedModel)) {
      effectiveModelId = DEFAULT_VISION_MODEL;
    }
    const usedVisionFallback = effectiveModelId !== selectedModel;

    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: trimmedContent, attachments: pendingAttachments };
    const assistantMessage: Message = { id: crypto.randomUUID(), role: 'assistant', content: '', modelName: selectedModelMeta.name };

    // Build the API message history (text only) and the current turn (multimodal
    // when the effective model can accept images).
    const historyMessages: AiChatMessage[] = messages.map((message) => ({ role: message.role, content: message.content }));
    const currentTurn: AiChatMessage =
      hasImages && isVisionModel(effectiveModelId)
        ? {
            role: 'user',
            content: [
              { type: 'text' as const, text: requestContent },
              ...imageAttachments.map((a) => ({ type: 'image_url' as const, image_url: { url: a.url } })),
            ],
          }
        : { role: 'user', content: requestContent };
    const allMessages: AiChatMessage[] = [...historyMessages, currentTurn];

    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    if (convId && isAuthenticated) {
      await saveMessage(
        convId,
        'user',
        trimmedContent || (pendingAttachments.length > 0 ? `[Image uploaded] ${pendingAttachments.map((attachment) => attachment.name).join(', ')}` : requestContent),
        undefined,
        pendingAttachments
      );
    }

    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

    setIsLoading(true);
    abortControllerRef.current = new AbortController();

    const timeoutMs = isImageGen
      ? SLOW_REQUEST_TIMEOUT_MS
      : SLOW_MODEL_IDS.has(effectiveModelId)
        ? SLOW_REQUEST_TIMEOUT_MS
        : REQUEST_TIMEOUT_MS;

    let timeoutReached = false;
    let receivedAssistantContent = false;
    const timeoutId = setTimeout(() => {
      timeoutReached = true;
      abortControllerRef.current?.abort();
    }, timeoutMs);

    try {
      if (isImageGen) {
        const imagePrompt = trimmedContent || 'a beautiful, highly detailed artistic image';
        const { imageDataUrl, message } = await generateImageResponse(
          imagePrompt,
          selectedModel,
          imageAttachments.map(a => ({ dataUrl: a.url })),
          abortControllerRef.current.signal
        );

        const imageContent = `![Generated Image](${imageDataUrl})\n\n${message}`;

        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMessage.id ? { ...m, content: imageContent, imageUrl: imageDataUrl } : m)),
        );
        receivedAssistantContent = true;

        if (convId && isAuthenticated) {
          await saveMessage(convId, 'assistant', imageContent, selectedModelMeta.name);
        }
      } else {
        let fullContent = '';

        // Ground time-sensitive / factual questions with live web results.
        // Skipped for image uploads (vision) since those are about the image.
        const messagesForModel = [...allMessages];
        if (!hasImages && shouldWebSearch(requestContent)) {
          setIsSearching(true);
          try {
            const search = await webSearch(requestContent, abortControllerRef.current.signal);
            const context = buildSearchContext(search);
            if (context) {
              messagesForModel.splice(messagesForModel.length - 1, 0, { role: 'system', content: context });
            }
          } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') throw err;
            // Non-fatal: fall back to answering without web grounding.
          } finally {
            setIsSearching(false);
          }
        }

        await generateChatResponse(
          messagesForModel,
          effectiveModelId,
          (delta) => {
            fullContent += delta;
            receivedAssistantContent = true;
            const liveContent = sanitizeAssistantText(fullContent) || fullContent;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMessage.id ? { ...m, content: liveContent } : m)),
            );
          },
          abortControllerRef.current.signal
        );

        const cleaned = sanitizeAssistantText(fullContent);

        if (cleaned) {
          const finalText = usedVisionFallback
            ? `${cleaned}\n\n*🔎 Analyzed with ${AI_MODELS.find(m => m.id === DEFAULT_VISION_MODEL)?.name || 'a vision model'} since ${selectedModelMeta.name} can't read images.*`
            : cleaned;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMessage.id ? { ...m, content: finalText } : m)),
          );

          if (convId && isAuthenticated) {
            await saveMessage(convId, 'assistant', finalText, selectedModelMeta.name);
          }
        } else {
          const fallback = 'I had a formatting hiccup—please send that once more 🙏';
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMessage.id ? { ...m, content: fallback } : m)),
          );
          if (convId && isAuthenticated) {
            await saveMessage(convId, 'assistant', fallback, selectedModelMeta.name);
          }
        }
      }

      if (convId && isAuthenticated && activeConversationId !== convId) {
        setActiveConversationId(convId);
      }

      if (isAuthenticated) loadConversations();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        if (timeoutReached && !receivedAssistantContent) {
          const timeoutMessage = 'That took too long on my side—please send it again and I’ll keep it short.';
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMessage.id ? { ...m, content: timeoutMessage } : m)),
          );
        }
      } else {
        console.error('Chat error:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to send message');
        const errContent = 'Oops, something went wrong. Please try again!';
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMessage.id ? { ...m, content: errContent } : m)),
        );
      }
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
      setIsSearching(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopGeneration = () => { abortControllerRef.current?.abort(); };
  const handleNewConversation = () => { setActiveConversationId(null); setMessages([]); setSidebarCollapsed(true); };

  // Regenerate: strip the last user+assistant turn, then resend the user's text.
  // Uses an effect so handleSendMessage runs against the trimmed message state.
  const [regenText, setRegenText] = useState<string | null>(null);
  const handleRegenerate = () => {
    if (isLoading) return;
    const lastUserIdx = [...messages].map((m) => m.role).lastIndexOf('user');
    if (lastUserIdx === -1) return;
    const lastUserText = messages[lastUserIdx].content;
    setMessages((prev) => prev.slice(0, lastUserIdx));
    setRegenText(lastUserText || ' ');
  };

  useEffect(() => {
    if (regenText !== null && !isLoading) {
      const text = regenText;
      setRegenText(null);
      handleSendMessage(text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regenText]);

  const handleDeleteConversation = async (id: string) => {
    try {
      await firestoreDb.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) { setActiveConversationId(null); setMessages([]); }
      toast.success('Conversation deleted');
    } catch {
      toast.error('Failed to delete conversation');
    }
  };

  const isAuthenticated = !!user && !isGuest;
  const selectedModelMeta = AI_MODELS.find((model) => model.id === selectedModel) || AI_MODELS[0];

  return (
    <div className="h-screen h-[100dvh] flex w-full bg-background overflow-hidden liquid-app">
      {isAuthenticated && (
        <ChatSidebar
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={(id) => { setActiveConversationId(id); setSidebarCollapsed(true); }}
          onNewConversation={handleNewConversation}
          onDeleteConversation={handleDeleteConversation}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          selectedModel={selectedModel}
          onSelectModel={handleSelectModel}
        />
      )}

      <main className="flex-1 flex flex-col h-full relative w-full min-w-0">
        <div className="pointer-events-none absolute inset-0 overflow-hidden liquid-canvas">
          <div className="absolute inset-0 liquid-sheen" />
          <div className="absolute inset-0 liquid-grid opacity-45" />
        </div>

        {/* Header */}
        <header className="h-14 sm:h-16 liquid-header flex items-center px-3 sm:px-4 gap-3 sm:gap-4 relative z-20 flex-shrink-0">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/[0.02] to-transparent pointer-events-none" />
          
          {isAuthenticated && (
            <motion.button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="relative p-2.5 rounded-xl bg-secondary/40 hover:bg-secondary/70 border border-border/30 transition-all duration-200 group"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Menu className="w-5 h-5 text-foreground/70 group-hover:text-foreground transition-colors" />
            </motion.button>
          )}
          
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <motion.div className="flex w-10 h-10 rounded-xl items-center justify-center flex-shrink-0 liquid-icon" whileHover={{ scale: 1.1, rotate: 5 }}>
              <Sparkles className="w-[18px] h-[18px] text-primary relative z-10" />
            </motion.div>
            <div className="min-w-0">
              <h1 className="font-display font-semibold text-base sm:text-lg truncate text-foreground/90">
                {activeConversationId ? conversations.find((c) => c.id === activeConversationId)?.title || 'Chat' : (selectedModelMeta?.name || 'AI')}
              </h1>
              {isLoading && (
                <motion.div className="flex items-center gap-2" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>
                  {isSearching ? (
                    <>
                      <motion.span
                        className="text-sm"
                        animate={{ rotate: [0, 360] }}
                        transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
                      >
                        🌐
                      </motion.span>
                      <span className="text-xs text-primary/90 font-medium">Searching the web…</span>
                    </>
                  ) : (
                    <>
                      <div className="flex gap-1">
                        {[0, 0.2, 0.4].map((d, i) => (
                          <motion.span key={i} className="w-1.5 h-1.5 rounded-full bg-primary" animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }} transition={{ duration: 1, repeat: Infinity, delay: d }} />
                        ))}
                      </div>
                      <span className="text-xs text-primary/80 font-medium">Generating...</span>
                    </>
                  )}
                </motion.div>
              )}
              {!isLoading && !isGuest && (
                <span className="text-xs text-muted-foreground/70 truncate block">{selectedModelMeta?.name || 'Default'} · {selectedModelMeta?.kind || 'Chat'}</span>
              )}
              {isGuest && !isLoading && (
                <span className="text-xs text-muted-foreground/60">Guest mode • <a href="/auth" className="text-primary hover:underline">Sign in to save chats</a></span>
              )}
            </div>
          </div>

          <div className="relative flex items-center gap-3 flex-shrink-0">
            {/* Accent Color Switcher */}
            <div className="hidden sm:flex items-center gap-1.5 bg-secondary/40 border border-border/30 rounded-xl p-1.5 backdrop-blur-md">
              {[
                { name: 'Teal', value: '172 66% 50%', bg: 'bg-[#1ad1b9]' },
                { name: 'Blue', value: '210 90% 55%', bg: 'bg-[#258eff]' },
                { name: 'Purple', value: '270 85% 60%', bg: 'bg-[#984cff]' },
                { name: 'Rose', value: '340 85% 55%', bg: 'bg-[#ff2d74]' },
                { name: 'Amber', value: '30 95% 55%', bg: 'bg-[#ff8f1f]' },
                { name: 'Emerald', value: '145 75% 45%', bg: 'bg-[#1cb866]' },
              ].map((c) => (
                <button
                  key={c.value}
                  onClick={() => setAccentColor(c.value)}
                  className={`w-3.5 h-3.5 rounded-full transition-all duration-200 hover:scale-125 ${c.bg} ${accentColor === c.value ? 'ring-2 ring-white scale-110 shadow-md shadow-white/30' : 'opacity-55 hover:opacity-100'}`}
                  title={`${c.name} Accent`}
                  aria-label={`Change accent color to ${c.name}`}
                />
              ))}
            </div>

            <ModelSelector selectedModel={selectedModel} onSelectModel={handleSelectModel} />
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollContainerRef} className="relative z-10 flex-1 overflow-y-auto scrollbar-thin min-h-0" style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
          <AnimatePresence mode="wait">
            {messages.length === 0 ? (
              <WelcomeScreen key="welcome" onSuggestionClick={handleSendMessage} modelName={selectedModelMeta?.name || 'AI'} />
            ) : (
              <motion.div key="messages" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8 space-y-3 sm:space-y-4">
                {messages.map((msg, index) => (
                  <ChatMessage
                    key={msg.id}
                    role={msg.role}
                    content={msg.content}
                    imageUrl={msg.imageUrl}
                    attachments={msg.attachments}
                    isStreaming={isLoading && msg.role === 'assistant' && index === messages.length - 1}
                    modelName={msg.modelName || 'AI'}
                    onRegenerate={handleRegenerate}
                    canRegenerate={msg.role === 'assistant' && index === messages.length - 1 && !isLoading}
                  />
                ))}
                <div ref={messagesEndRef} className="h-4" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Input */}
        <div className="relative z-20 flex-shrink-0">
          <ChatInput onSend={handleSendMessage} isLoading={isLoading} onStop={handleStopGeneration} modelName={selectedModelMeta?.name || 'AI'} modelKind={selectedModelMeta?.kind || 'Chat'} />
        </div>
      </main>
    </div>
  );
}
