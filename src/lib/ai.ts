// All chat models are routed through NVIDIA NIM (requires API key)
// The /api/nvidia proxy in vite.config.ts handles CORS and streaming.

export const DEFAULT_CHAT_MODEL = "z-ai/glm-5.2";

// ---------------------------------------------------------------------------
// Model → NVIDIA NIM ID mapping
// ---------------------------------------------------------------------------

// Maps our internal model IDs to EXACT NVIDIA NIM model IDs
export const MODEL_REGISTRY: Record<string, { nvidiaId: string; kind: 'Chat' | 'Vision' | 'Image' }> = {
  // ── Featured Chat / Reasoning Models ──────────
  "glm-5.2":           { nvidiaId: "z-ai/glm-5.2",                            kind: "Chat" },
  "deepseek-v4-pro":   { nvidiaId: "deepseek-ai/deepseek-v4-pro",             kind: "Chat" },
  "deepseek-v4-flash": { nvidiaId: "deepseek-ai/deepseek-v4-flash",           kind: "Chat" },
  "kimi-k2.6":         { nvidiaId: "moonshotai/kimi-k2.6",                    kind: "Chat" },
  "minimax-m3":        { nvidiaId: "minimaxai/minimax-m3",                    kind: "Chat" },
  "qwen-3.5-397b":     { nvidiaId: "qwen/qwen3.5-397b-a17b",                  kind: "Chat" },
  "qwen-3-next-80b":   { nvidiaId: "qwen/qwen3-next-80b-a3b-instruct",        kind: "Chat" },
  "cosmos-reason":     { nvidiaId: "nvidia/cosmos-reason2-8b",                kind: "Chat" },
  "llama-70b":         { nvidiaId: "meta/llama-3.3-70b-instruct",             kind: "Chat" },
  "llama-405b":        { nvidiaId: "meta/llama-3.1-405b-instruct",            kind: "Chat" },
  "nemotron-70b":      { nvidiaId: "nvidia/llama-3.1-nemotron-70b-instruct",  kind: "Chat" },
  "gpt-oss-120b":      { nvidiaId: "openai/gpt-oss-120b",                     kind: "Chat" },
  "mistral-large-3":   { nvidiaId: "mistralai/mistral-large-3-675b-instruct-2512", kind: "Chat" },

  // ── More Chat Models ──────────────────────────
  "llama-maverick":    { nvidiaId: "meta/llama-4-maverick-17b-128e-instruct", kind: "Chat" },
  "llama-8b":          { nvidiaId: "meta/llama-3.1-8b-instruct",              kind: "Chat" },
  "llama-3b":          { nvidiaId: "meta/llama-3.2-3b-instruct",              kind: "Chat" },
  "mistral-large":     { nvidiaId: "mistralai/mistral-large-2-instruct",      kind: "Chat" },
  "mixtral-8x22b":     { nvidiaId: "mistralai/mixtral-8x22b-v0.1",            kind: "Chat" },
  "gemma-2-27b":       { nvidiaId: "google/gemma-2-27b-it",                   kind: "Chat" },
  "gemma-3-31b":       { nvidiaId: "google/gemma-4-31b-it",                   kind: "Chat" },
  "gemma-3-12b":       { nvidiaId: "google/gemma-3-12b-it",                   kind: "Chat" },
  "phi-3.5-moe":       { nvidiaId: "microsoft/phi-3.5-moe-instruct",          kind: "Chat" },
  "deepseek-coder":    { nvidiaId: "deepseek-ai/deepseek-coder-6.7b-instruct",kind: "Chat" },
  "codestral":         { nvidiaId: "mistralai/codestral-22b-instruct-v0.1",   kind: "Chat" },
  "mistral-nemo":      { nvidiaId: "nv-mistralai/mistral-nemo-12b-instruct",  kind: "Chat" },
  "yi-large":          { nvidiaId: "01-ai/yi-large",                          kind: "Chat" },
  "dbrx-instruct":     { nvidiaId: "databricks/dbrx-instruct",                kind: "Chat" },

  // ── Vision Models ─────────────────────────────
  "llama-vision":      { nvidiaId: "meta/llama-3.2-11b-vision-instruct",      kind: "Vision" },
  "nemotron-vl":       { nvidiaId: "nvidia/llama-3.1-nemotron-nano-vl-8b-v1", kind: "Vision" },
  "nemoretriever":     { nvidiaId: "nvidia/nemoretriever-parse",              kind: "Vision" },
  "llama-90b-vision":  { nvidiaId: "meta/llama-3.2-90b-vision-instruct",      kind: "Vision" },

  // ── Image Generation Models (via Pollinations) ──
  "qwen-image":        { nvidiaId: "pollinations", kind: "Image" },
  "sd-3.5-large":      { nvidiaId: "pollinations", kind: "Image" },
  "flux2-klein":       { nvidiaId: "pollinations", kind: "Image" },
  "qwen-image-edit":   { nvidiaId: "pollinations", kind: "Image" },
};

export function getNvidiaId(modelId: string): string {
  return MODEL_REGISTRY[modelId]?.nvidiaId || "z-ai/glm-5.2";
}

export function isVisionModel(modelId: string): boolean {
  return MODEL_REGISTRY[modelId]?.kind === "Vision";
}

export function isImageModel(modelId: string): boolean {
  return MODEL_REGISTRY[modelId]?.kind === "Image";
}

// ---------------------------------------------------------------------------
// API Key Retreivers
// ---------------------------------------------------------------------------

const getNvidiaApiKey = () => {
  const localKey = localStorage.getItem("VITE_NVIDIA_API_KEY") || localStorage.getItem("NVIDIA_API_KEY");
  if (localKey) return localKey.trim();
  const envKey = import.meta.env.VITE_NVIDIA_API_KEY as string | undefined;
  return envKey ? envKey.trim() : undefined;
};

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

type TextPart = { type: "text"; text: string };
type ImagePart = { type: "image_url"; image_url: { url: string } };
export type ContentPart = TextPart | ImagePart;

export interface ChatMessage {
  role: string;
  content: string | ContentPart[];
}

// ---------------------------------------------------------------------------
// Chat / Vision streaming — via NVIDIA NIM
// ---------------------------------------------------------------------------

export async function generateChatResponse(
  messages: ChatMessage[],
  modelId: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
) {
  const key = getNvidiaApiKey();
  if (!key) {
    throw new Error("NVIDIA API key is missing. Please configure it in Settings (⚙️) or set VITE_NVIDIA_API_KEY in your .env file.");
  }
  const nvidiaModel = getNvidiaId(modelId);

  // Use the /api/nvidia proxy to avoid CORS issues in dev
  const response = await fetch("/api/nvidia", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Nvidia-Api-Key": key,
    },
    body: JSON.stringify({
      model: nvidiaModel,
      messages,
      stream: true,
      temperature: 0.7,
      top_p: 0.95,
      max_tokens: 4096,
    }),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("NVIDIA proxy error:", response.status, errText);
    
    // Try to parse friendly error
    try {
      const parsed = JSON.parse(errText);
      if (parsed.detail) throw new Error(parsed.detail);
      if (parsed.error && typeof parsed.error === "string") throw new Error(parsed.error);
    } catch (e) {
      if (e instanceof Error && e.message !== errText) throw e;
    }
    throw new Error(friendlyHttpError(response.status, "NVIDIA NIM"));
  }

  await pumpOpenAiStream(response, onChunk);
}

// ---------------------------------------------------------------------------
// Stream pump (OpenAI-compatible SSE)
// ---------------------------------------------------------------------------

async function pumpOpenAiStream(
  response: Response,
  onChunk: (text: string) => void,
) {
  if (!response.body) throw new Error("No response body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith(":") || !trimmedLine.startsWith("data:")) continue;

      const payload = trimmedLine.replace(/^data:\s*/, "");
      if (payload === "[DONE]") continue;

      try {
        const parsed = JSON.parse(payload);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) onChunk(delta);
      } catch {
        // ignore JSON parse errors for incomplete chunks
      }
    }
  }
}

function friendlyHttpError(status: number, providerLabel: string): string {
  if (status === 401 || status === 403) return `Authentication failed with ${providerLabel}. Please check your API key.`;
  if (status === 404) return "That model is currently unavailable on NVIDIA NIM. Try a different one.";
  if (status === 429) return "Rate limit reached. Please wait a moment and try again.";
  if (status >= 500) return "The model service is temporarily unavailable. Please retry.";
  return `The model responded with an error (${status}).`;
}

// ---------------------------------------------------------------------------
// Image generation
// ---------------------------------------------------------------------------

export async function generateImageResponse(
  prompt: string,
  modelId: string,
  _images: Array<{ dataUrl?: string }>,
  signal?: AbortSignal,
): Promise<{ imageDataUrl: string; message: string }> {
  // Use pollinations.ai directly for image generation since it's keyless and doesn't require CORS handling
  const pollinationsModel = modelId === "flux2-klein" ? "flux" : modelId === "sd-3.5-large" ? "stable-diffusion-3" : "any";
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?nologo=true&enhance=true&model=${pollinationsModel}`;
  
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Image generation failed: ${res.statusText}`);
  }
  
  const blob = await res.blob();
  const imageDataUrl = URL.createObjectURL(blob);
  
  return {
    imageDataUrl,
    message: "Here is your generated image:"
  };
}
