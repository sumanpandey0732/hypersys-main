// All chat models are routed through NVIDIA NIM (requires API key)
// The /api/nvidia proxy in vite.config.ts handles CORS and streaming.

export const DEFAULT_CHAT_MODEL = "llama-8b";

// ---------------------------------------------------------------------------
// Model → NVIDIA NIM ID mapping
// ---------------------------------------------------------------------------

// Maps our internal model IDs to EXACT NVIDIA NIM model IDs.
// Every ID here was verified live against the account's NVIDIA NIM catalog —
// only models that actually respond (HTTP 200 to a streaming completion) are
// listed. IDs that 404, are DEGRADED, or hang were removed so the UI never
// offers a model that produces "Failed to fetch".
export const MODEL_REGISTRY: Record<string, { nvidiaId: string; kind: 'Chat' | 'Vision' | 'Image' }> = {
  // ── Featured Chat / Reasoning Models ──────────
  "deepseek-v4-pro":   { nvidiaId: "deepseek-ai/deepseek-v4-pro",             kind: "Chat" },
  "deepseek-v4-flash": { nvidiaId: "deepseek-ai/deepseek-v4-flash",           kind: "Chat" },
  "minimax-m3":        { nvidiaId: "minimaxai/minimax-m3",                    kind: "Chat" },
  "minimax-m2.7":      { nvidiaId: "minimaxai/minimax-m2.7",                  kind: "Chat" },
  "qwen-3.5-122b":     { nvidiaId: "qwen/qwen3.5-122b-a10b",                  kind: "Chat" },
  "qwen-3-next-80b":   { nvidiaId: "qwen/qwen3-next-80b-a3b-instruct",        kind: "Chat" },
  "gpt-oss-120b":      { nvidiaId: "openai/gpt-oss-120b",                     kind: "Chat" },
  "gpt-oss-20b":       { nvidiaId: "openai/gpt-oss-20b",                      kind: "Chat" },
  "llama-70b":         { nvidiaId: "meta/llama-3.1-70b-instruct",             kind: "Chat" },
  "nemotron-super-49b":{ nvidiaId: "nvidia/llama-3.3-nemotron-super-49b-v1.5",kind: "Chat" },
  "mistral-small-4":   { nvidiaId: "mistralai/mistral-small-4-119b-2603",     kind: "Chat" },
  "step-3.7-flash":    { nvidiaId: "stepfun-ai/step-3.7-flash",              kind: "Chat" },

  // ── More Chat Models ──────────────────────────
  "llama-8b":          { nvidiaId: "meta/llama-3.1-8b-instruct",              kind: "Chat" },
  "nemotron-nano-9b":  { nvidiaId: "nvidia/nvidia-nemotron-nano-9b-v2",       kind: "Chat" },

  // ── Vision Models ─────────────────────────────
  "llama-vision":      { nvidiaId: "meta/llama-3.2-11b-vision-instruct",      kind: "Vision" },
  "nemotron-vl":       { nvidiaId: "nvidia/llama-3.1-nemotron-nano-vl-8b-v1", kind: "Vision" },
  "nemotron-12b-vl":   { nvidiaId: "nvidia/nemotron-nano-12b-v2-vl",          kind: "Vision" },

  // ── Image Generation Models (via Pollinations) ──
  "qwen-image":        { nvidiaId: "pollinations", kind: "Image" },
  "sd-3.5-large":      { nvidiaId: "pollinations", kind: "Image" },
  "flux2-klein":       { nvidiaId: "pollinations", kind: "Image" },
  "qwen-image-edit":   { nvidiaId: "pollinations", kind: "Image" },
};

export function getNvidiaId(modelId: string): string {
  return MODEL_REGISTRY[modelId]?.nvidiaId || "meta/llama-3.1-8b-instruct";
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

// Only ever returns a user-supplied ("bring your own") key from Settings.
// The app's own key is NEVER read here — it lives server-side on the /api
// proxy so it can't be extracted from the browser bundle. When this returns
// undefined the client calls the proxy keyless and the server injects its key.
const getUserNvidiaApiKey = () => {
  const localKey = localStorage.getItem("VITE_NVIDIA_API_KEY") || localStorage.getItem("NVIDIA_API_KEY");
  return localKey ? localKey.trim() : undefined;
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
  const nvidiaModel = getNvidiaId(modelId);

  // All requests go through the same-origin /api/nvidia proxy, which holds the
  // app's server-side key. Only attach a key header if the user configured
  // their OWN key in Settings — the app key never touches the browser.
  const userKey = getUserNvidiaApiKey();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userKey) headers["X-Nvidia-Api-Key"] = userKey;

  const response = await fetch("/api/nvidia", {
    method: "POST",
    headers,
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
