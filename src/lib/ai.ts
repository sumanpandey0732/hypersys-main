// All chat models are routed through NVIDIA NIM (requires API key)
// The /api/nvidia proxy in vite.config.ts handles CORS and streaming.

// Default flagship shown as "Flyer". Points at a verified-working model
// (openai/gpt-oss-120b — confirmed live, ~30s first token on 2026-07-21).
export const DEFAULT_CHAT_MODEL = "mistralai/mistral-large-3-675b-instruct-2512";

// ---------------------------------------------------------------------------
// Model → NVIDIA NIM ID mapping
// ---------------------------------------------------------------------------

// Maps our internal model IDs to EXACT NVIDIA NIM model IDs from the account's
// live NVIDIA NIM catalog. Some large models cold-start slowly (30-90s on first
// hit) but do respond within the app's timeout window.
//
// Verified live against the account's NVIDIA NIM catalog on 2026-07-21 by
// issuing a real chat completion to each. Only models that returned a 200 (or
// a valid slow cold-start stream) are kept. Removed as 404 "Function not found
// for account": moonshotai/kimi-k2.6, nvidia/llama-3.1-nemotron-ultra-253b-v1,
// google/gemma-3-12b-it. z-ai/glm-5.2 remains DOWN (0 bytes / timeout).
//
// SLOW models (60-100s first-token cold start, then fine): qwen-3.5-397b,
// minimax-m3, llama-4-maverick, mistral-large, mistral-medium. The chat
// timeout is sized to let these complete — see REQUEST_TIMEOUT_MS in Chat.tsx.
export const MODEL_REGISTRY: Record<string, { nvidiaId: string; kind: 'Chat' | 'Vision' | 'Image' }> = {
  // ── Featured Chat / Reasoning Models ──────────
  "deepseek-v4-pro":   { nvidiaId: "deepseek-ai/deepseek-v4-pro",             kind: "Chat" },
  "deepseek-v4-flash": { nvidiaId: "deepseek-ai/deepseek-v4-flash",           kind: "Chat" },
  "llama-4-maverick":  { nvidiaId: "meta/llama-4-maverick-17b-128e-instruct", kind: "Chat" },
  "minimax-m3":        { nvidiaId: "minimaxai/minimax-m3",                    kind: "Chat" },
  "minimax-m2.7":      { nvidiaId: "minimaxai/minimax-m2.7",                  kind: "Chat" },
  "qwen-3.5-397b":     { nvidiaId: "qwen/qwen3.5-397b-a17b",                  kind: "Chat" },
  "qwen-3-next-80b":   { nvidiaId: "qwen/qwen3-next-80b-a3b-instruct",        kind: "Chat" },
  "gpt-oss-120b":      { nvidiaId: "openai/gpt-oss-120b",                     kind: "Chat" },
  "gpt-oss-20b":       { nvidiaId: "openai/gpt-oss-20b",                      kind: "Chat" },
  "llama-3.3-70b":     { nvidiaId: "meta/llama-3.3-70b-instruct",             kind: "Chat" },
  "llama-70b":         { nvidiaId: "meta/llama-3.1-70b-instruct",             kind: "Chat" },
  "nemotron-super-49b":{ nvidiaId: "nvidia/llama-3.3-nemotron-super-49b-v1.5",kind: "Chat" },
  "mistral-large":     { nvidiaId: "mistralai/mistral-large-3-675b-instruct-2512", kind: "Chat" },
  "mistral-medium":    { nvidiaId: "mistralai/mistral-medium-3.5-128b",       kind: "Chat" },
  "step-3.7-flash":    { nvidiaId: "stepfun-ai/step-3.7-flash",              kind: "Chat" },

  // ── More Chat Models ──────────────────────────
  "llama-8b":          { nvidiaId: "meta/llama-3.1-8b-instruct",              kind: "Chat" },
  "nemotron-nano-9b":  { nvidiaId: "nvidia/nvidia-nemotron-nano-9b-v2",       kind: "Chat" },

  // ── Vision Models ─────────────────────────────
  "llama-vision":      { nvidiaId: "meta/llama-3.2-11b-vision-instruct",      kind: "Vision" },
  "nemotron-vl":       { nvidiaId: "nvidia/llama-3.1-nemotron-nano-vl-8b-v1", kind: "Vision" },
  "nemotron-12b-vl":   { nvidiaId: "nvidia/nemotron-nano-12b-v2-vl",          kind: "Vision" },

  // ── Image Generation Models (via Pollinations) ──
  // The 5 most popular/latest models VERIFIED LIVE on the keyless anonymous
  // Pollinations tier on 2026-07-21. Each was confirmed twice by issuing real
  // generations (200 image/jpeg, distinct outputs with unique prompts). Excluded
  // after testing: "kontext" and "nanobanana" — both 500 "only available on
  // enter.pollinations.ai" (paid tier), so they'd break for our keyless users.
  "flux":              { nvidiaId: "pollinations", kind: "Image" }, // default, highest quality
  "gptimage":          { nvidiaId: "pollinations", kind: "Image" }, // newest, ChatGPT-style
  "turbo":             { nvidiaId: "pollinations", kind: "Image" }, // fastest
  "sana":              { nvidiaId: "pollinations", kind: "Image" }, // NVIDIA Sana, fast + crisp
  "stable-diffusion":  { nvidiaId: "pollinations", kind: "Image" }, // classic SD baseline
};

export function getNvidiaId(modelId: string): string {
  return MODEL_REGISTRY[modelId]?.nvidiaId || "openai/gpt-oss-120b";
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

// Turn a plain user request into a rich, intent-aware generation prompt. This
// is the "system prompt" for image models: it detects what the user is trying
// to make (logo, photo, art, 3D, anime, UI…) and appends the quality/style
// descriptors that steer the diffusion model toward that intent — the same way
// ChatGPT's image tool rewrites a bare request before generating.
export function buildImagePrompt(userPrompt: string): string {
  const base = (userPrompt || "").trim() || "a beautiful, highly detailed artistic image";
  const p = base.toLowerCase();

  const has = (...words: string[]) => words.some((w) => p.includes(w));

  let style: string;
  if (has("logo", "icon", "emblem", "brand")) {
    style = "clean professional vector logo, minimal, flat design, centered, crisp edges, high resolution, plain background";
  } else if (has("photo", "photograph", "realistic", "photorealistic", "portrait", "headshot")) {
    style = "photorealistic, ultra detailed, 8k, sharp focus, natural lighting, professional photography, high dynamic range";
  } else if (has("anime", "manga", "cartoon", "comic")) {
    style = "vibrant anime illustration, clean line art, cel shading, expressive, highly detailed, studio quality";
  } else if (has("3d", "render", "blender", "octane")) {
    style = "high-quality 3D render, physically based rendering, soft global illumination, detailed textures, cinematic";
  } else if (has("ui", "app", "website", "dashboard", "mockup", "interface")) {
    style = "clean modern UI design mockup, crisp, well-aligned, professional, high resolution";
  } else if (has("poster", "banner", "wallpaper", "cover")) {
    style = "striking poster art, bold composition, dramatic lighting, high detail, 4k";
  } else if (has("sketch", "drawing", "pencil", "line art")) {
    style = "detailed hand-drawn sketch, expressive linework, fine shading";
  } else {
    style = "highly detailed, masterpiece, vibrant, sharp focus, 4k, professional quality";
  }

  return `${base}. ${style}.`;
}

// Map our internal image model IDs to a valid Pollinations model name.
// Our IDs are already the exact Pollinations model names (verified live), so
// this is a passthrough with a safe "flux" fallback for anything unknown.
const POLLINATIONS_MODELS = new Set(["flux", "gptimage", "turbo", "sana", "stable-diffusion"]);
function pollinationsModelFor(modelId: string): string {
  return POLLINATIONS_MODELS.has(modelId) ? modelId : "flux";
}

export async function generateImageResponse(
  prompt: string,
  modelId: string,
  _images: Array<{ dataUrl?: string }>,
  signal?: AbortSignal,
): Promise<{ imageDataUrl: string; message: string }> {
  // Pollinations.ai is keyless and CORS-friendly, so we call it directly.
  const enhancedPrompt = buildImagePrompt(prompt);
  const pollinationsModel = pollinationsModelFor(modelId);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?nologo=true&enhance=true&model=${pollinationsModel}`;

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Image generation failed: ${res.statusText}`);
  }

  const blob = await res.blob();
  const imageDataUrl = URL.createObjectURL(blob);

  return {
    imageDataUrl,
    message: "Here is your generated image:",
  };
}
