import { motion } from 'framer-motion';
import { Sparkles, Copy, Check, Volume2, VolumeX, Loader2, FileText, Download, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useState } from 'react';
import { useElevenLabsTTS } from '@/hooks/useElevenLabsTTS';
import { extractFirstMarkdownImage, sanitizeAssistantText, stripMarkdownImages } from '@/lib/chat-format';
import type { ChatAttachment } from './types';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  attachments?: ChatAttachment[];
  imageUrl?: string;
  modelName?: string;
  onRegenerate?: () => void;
  canRegenerate?: boolean;
}

function CodeBlock({ language, children }: { language: string; children: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-5 rounded-2xl overflow-hidden border border-border/40 bg-card shadow-xl">
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-secondary/90 to-secondary/70 border-b border-border/30">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/70" />
            <div className="w-3 h-3 rounded-full bg-amber-500/70" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/70" />
          </div>
          <span className="text-xs text-muted-foreground/70 font-mono ml-2 uppercase tracking-wider">{language || 'code'}</span>
        </div>
        <button onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background/60 hover:bg-background text-xs text-muted-foreground hover:text-foreground transition-all border border-border/20">
          {copied ? <><Check className="w-3.5 h-3.5 text-primary" /><span className="text-primary font-medium">Copied!</span></> : <><Copy className="w-3.5 h-3.5" /><span>Copy</span></>}
        </button>
      </div>
      <div className="overflow-x-auto">
        <SyntaxHighlighter
          language={language || 'text'}
          style={oneDark}
          customStyle={{ margin: 0, padding: '1.25rem 1.5rem', background: 'transparent', fontSize: '0.875rem', lineHeight: '1.7' }}
          showLineNumbers={children.split('\n').length > 3}
          lineNumberStyle={{ opacity: 0.4, minWidth: '2.5em' }}
        >
          {children}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

export default function ChatMessage({ role, content, isStreaming, attachments = [], imageUrl, modelName = "AI", onRegenerate, canRegenerate }: ChatMessageProps) {
  const isUser = role === 'user';
  const [copiedAll, setCopiedAll] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const { speak, stop, isSpeaking, isLoading: isTTSLoading } = useElevenLabsTTS();

  const displayContent = isUser ? content : sanitizeAssistantText(content);
  const generatedImageUrl = !isUser ? imageUrl || extractFirstMarkdownImage(displayContent) : undefined;
  const textOnlyContent = !isUser ? stripMarkdownImages(displayContent) : displayContent;

  const handleCopyAll = async () => {
    await navigator.clipboard.writeText(textOnlyContent || displayContent);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const handleDownloadImage = async () => {
    if (!generatedImageUrl) return;
    try {
      let href = generatedImageUrl;
      if (!href.startsWith('data:')) {
        const res = await fetch(generatedImageUrl);
        const blob = await res.blob();
        href = URL.createObjectURL(blob);
      }
      const a = document.createElement('a');
      a.href = href;
      a.download = `aetheris-image-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (!generatedImageUrl.startsWith('data:')) setTimeout(() => URL.revokeObjectURL(href), 4000);
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 2000);
    } catch (e) {
      console.error('Download failed', e);
    }
  };

  const handleSpeak = () => {
    if (isSpeaking) stop();
    else speak(textOnlyContent || displayContent);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`w-full ${isUser ? 'flex justify-end' : ''}`}
    >
      {isUser ? (
        <div className="max-w-[85%] sm:max-w-[75%]">
          <div className="liquid-message-user rounded-2xl rounded-br-md px-5 py-3.5 backdrop-blur-xl">
            {attachments.length > 0 && (
              <div className="grid grid-cols-2 gap-2 mb-3">
                {attachments.map((attachment) => (
                  <div key={attachment.id} className="rounded-2xl overflow-hidden border border-primary/20 bg-background/50">
                    {attachment.type === 'image' ? (
                      <img src={attachment.url} alt={attachment.name} className="w-full h-32 object-cover block" loading="lazy" />
                    ) : (
                      <div className="h-32 flex flex-col items-center justify-center gap-2 px-3 text-center bg-background/60">
                        <FileText className="w-6 h-6 text-primary" />
                        <p className="text-xs text-foreground/80 line-clamp-2">{attachment.name}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {content && <p className="text-sm sm:text-[15px] leading-relaxed text-foreground font-medium">{content}</p>}
          </div>
        </div>
      ) : (
        <div className="w-full">
          {/* AI indicator + actions */}
          <div className="flex items-center gap-2 mb-3 justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg liquid-icon flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm font-semibold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">{modelName}</span>
            </div>
            <div className="flex items-center gap-2">
              {canRegenerate && onRegenerate && !isStreaming && (
                <button type="button" onClick={onRegenerate}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/50 hover:bg-secondary text-xs text-muted-foreground hover:text-foreground transition-all border border-border/30 hover:border-primary/30"
                  title="Regenerate response">
                  <RefreshCw className="w-3.5 h-3.5" /><span className="hidden sm:inline">Retry</span>
                </button>
              )}
              <button type="button" onClick={handleSpeak} disabled={isTTSLoading}
                className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all border ${isSpeaking ? 'bg-primary/20 text-primary border-primary/30' : isTTSLoading ? 'bg-primary/10 text-primary border-primary/20' : 'bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground border-border/30 hover:border-primary/30'}`}>
                {isTTSLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : isSpeaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <button type="button" onClick={handleCopyAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/50 hover:bg-secondary text-xs text-muted-foreground hover:text-foreground transition-all border border-border/30 hover:border-primary/30">
                {copiedAll ? <><Check className="w-3.5 h-3.5 text-primary" /><span className="text-primary font-medium">Copied</span></> : <><Copy className="w-3.5 h-3.5" /><span>Copy</span></>}
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="w-full">
            {generatedImageUrl && (
              <div className="mb-5 relative group/image rounded-2xl overflow-hidden liquid-surface border border-border/30 shadow-2xl">
                <img src={generatedImageUrl} alt="Generated image" className="w-full h-auto block" loading="lazy" />
                <button
                  type="button"
                  onClick={handleDownloadImage}
                  className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-background/70 backdrop-blur-md border border-border/40 text-xs font-medium text-foreground/90 hover:text-primary hover:border-primary/40 opacity-0 group-hover/image:opacity-100 transition-all duration-200"
                  title="Download image"
                >
                  {downloaded ? <><Check className="w-4 h-4 text-primary" />Saved</> : <><Download className="w-4 h-4" />Download</>}
                </button>
              </div>
            )}

            {textOnlyContent ? (
              <div className="prose prose-lg sm:prose-xl prose-invert max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ children }) => (
                      <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-5 mt-8 first:mt-0 text-foreground bg-gradient-to-r from-primary/20 via-primary/10 to-transparent py-3 px-4 rounded-xl border-l-4 border-primary">
                        {children}
                      </h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-xl sm:text-2xl md:text-3xl font-bold mb-4 mt-7 first:mt-0 text-foreground flex items-center gap-3">
                        <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-primary to-primary/50 flex-shrink-0" />
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-lg sm:text-xl md:text-2xl font-semibold mb-3 mt-6 first:mt-0 text-foreground/95 border-b border-border/30 pb-2">{children}</h3>
                    ),
                    p: ({ children, node }) => {
                      // If paragraph contains only an image, render as div to avoid nesting issues
                      const hasImage = node?.children?.some((child: any) => child.tagName === 'img');
                      if (hasImage) {
                        return <div className="text-[15px] sm:text-base md:text-lg leading-[1.85] mb-4 last:mb-0 text-foreground/90">{children}</div>;
                      }
                      return <p className="text-[15px] sm:text-base md:text-lg leading-[1.85] mb-4 last:mb-0 text-foreground/90">{children}</p>;
                    },
                    ul: ({ children }) => <ul className="space-y-3.5 my-4 pl-1 list-none">{children}</ul>,
                    ol: ({ children }) => <ol className="space-y-3.5 my-4 pl-1 list-none">{children}</ol>,
                    li: ({ children }) => (
                      <li className="flex items-start gap-3.5 text-[15px] sm:text-base leading-relaxed text-foreground/90 py-1.5 px-1 hover:translate-x-0.5 transition-transform duration-200">
                        <span className="flex-shrink-0 mt-2.5 w-2 h-2 rounded-full bg-gradient-to-br from-primary to-primary/60 shadow-sm shadow-primary/45" />
                        <span className="flex-1">{children}</span>
                      </li>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-extrabold gradient-text">{children}</strong>
                    ),
                    em: ({ children }) => <em className="italic text-primary/90">{children}</em>,
                    blockquote: ({ children }) => (
                      <blockquote className="my-5 pl-5 py-3 border-l-4 border-primary/40 bg-primary/5 rounded-r-xl text-foreground/85 italic">{children}</blockquote>
                    ),
                    code: ({ className, children }) => {
                      const match = /language-(\w+)/.exec(className || '');
                      if (!match) {
                        return <code className="px-2 py-0.5 rounded-md bg-primary/15 text-primary font-mono text-[0.9em] border border-primary/20">{children}</code>;
                      }
                      return <CodeBlock language={match[1]}>{String(children).replace(/\n$/, '')}</CodeBlock>;
                    },
                    pre: ({ children }) => <>{children}</>,
                    a: ({ href, children }) => (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary font-semibold hover:underline underline-offset-4">{children}</a>
                    ),
                    table: ({ children }) => (
                      <div className="my-5 overflow-x-auto rounded-2xl border border-border/40 shadow-lg">
                        <table className="w-full text-base">{children}</table>
                      </div>
                    ),
                    th: ({ children }) => <th className="px-5 py-3 text-left font-bold bg-primary/10 border-b border-border/40 text-foreground">{children}</th>,
                    td: ({ children }) => <td className="px-5 py-3 border-b border-border/20 text-foreground/85">{children}</td>,
                    hr: () => <hr className="my-8 border-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />,
                    img: ({ src, alt }) => {
                      if (src && (src.startsWith('data:image') || src.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i))) {
                        return (
                          <span className="block my-5 rounded-2xl overflow-hidden border border-border/30 shadow-2xl">
                            <img src={src} alt={alt || 'Generated image'} className="w-full h-auto block" loading="lazy" />
                          </span>
                        );
                      }
                      return (
                        <span className="block my-5 rounded-2xl overflow-hidden border border-border/30 shadow-2xl">
                          <img src={src} alt={alt || ''} className="w-full h-auto block" loading="lazy" />
                        </span>
                      );
                    },
                  }}
                >
                  {textOnlyContent}
                </ReactMarkdown>
              </div>
            ) : isStreaming ? (
              <div className="flex items-center gap-3 py-2">
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <motion.span key={i} className="w-2 h-2 rounded-full bg-primary"
                      animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15 }}
                    />
                  ))}
                </div>
                <span className="text-sm text-primary/80 font-medium">Thinking...</span>
              </div>
            ) : null}

            {isStreaming && content && (
              <motion.span className="inline-block w-0.5 h-5 bg-primary ml-0.5 align-middle rounded-full"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 0.6, repeat: Infinity }}
              />
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
