// ---------------------------------------------------------------------------
// Model registry
// ---------------------------------------------------------------------------
// These IDs are verified against the NVIDIA `integrate.api.nvidia.com` catalog.
// `default` maps to a fast, reliable flagship so the app never falls through to
// an invalid model id.

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

// Mistral is called through our same-origin serverless proxy (Firebase
// Function behind the /api Hosting rewrite) so the key stays server-side and
// there is no browser CORS issue. See functions/index.js.
const MISTRAL_PROXY_URL = "/api/mistral";

export const DEFAULT_CHAT_MODEL = "z-ai/glm-5.2";

// Client model-id -> Mistral API model name. These route through the proxy.
export const MISTRAL_MODELS: Record<string, string> = {
  "ms-large": "mistral-large-latest",
  "ms-small": "mistral-small-latest",
  "ms-nemo": "open-mistral-nemo",
  "ms-codestral": "codestral-latest",
};

export function isMistralModel(modelId: string): boolean {
  return modelId in MISTRAL_MODELS;
}

export const NVIDIA_MODELS: Record<string, string> = {
  default: DEFAULT_CHAT_MODEL,
  "nv-glm": "z-ai/glm-5.2",
  "nv-deepseek": "deepseek-ai/deepseek-v4-pro",
  "nv-deepseek-flash": "deepseek-ai/deepseek-v4-flash",
  "nv-kimi": "moonshotai/kimi-k2.6",
  "nv-minimax": "minimaxai/minimax-m3",
  "nv-qwen35-397b": "qwen/qwen3.5-397b-a17b",
  "nv-qwen3-next": "qwen/qwen3-next-80b-a3b-instruct",
  "nv-llama33-70b": "meta/llama-3.3-70b-instruct",
  // Vision-capable models (accept image_url content)
  "nv-cosmos-reason": "nvidia/cosmos-reason2-8b",
  "nv-llama32-11b-vision": "meta/llama-3.2-11b-vision-instruct",
  "nv-llama32-90b-vision": "meta/llama-3.2-90b-vision-instruct",
  "nv-nemotron-vl": "nvidia/nemotron-nano-12b-v2-vl",
  "nv-llama-nemotron-vl": "nvidia/llama-3.1-nemotron-nano-vl-8b-v1",
};

// Models that can accept image inputs (OpenAI-style image_url content parts).
export const VISION_MODEL_IDS = new Set<string>([
  "nv-cosmos-reason",
  "nv-llama32-11b-vision",
  "nv-llama32-90b-vision",
  "nv-nemotron-vl",
  "nv-llama-nemotron-vl",
]);

// Reasoning models that stream slowly and need a longer client timeout.
export const SLOW_MODEL_IDS = new Set<string>([
  "nv-deepseek",
  "nv-minimax",
  "nv-qwen35-397b",
]);

export const IMAGE_MODELS: Record<string, string> = {
  "nv-qwen-image": "flux",
  "nv-sd35-large": "flux",
  "nv-flux2-klein": "flux",
  "nv-qwen-image-edit": "flux",
};

export function isVisionModel(modelId: string): boolean {
  return VISION_MODEL_IDS.has(modelId);
}

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

const apiKey = () => import.meta.env.VITE_NVIDIA_API_KEY as string | undefined;

// ---------------------------------------------------------------------------
// Chat / vision streaming
// ---------------------------------------------------------------------------

export async function generateChatResponse(
  messages: ChatMessage[],
  modelId: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
) {
  if (isMistralModel(modelId)) {
    return generateMistralResponse(messages, modelId, onChunk, signal);
  }
  return generateNvidiaResponse(messages, modelId, onChunk, signal);
}

// Parse an OpenAI-compatible SSE stream and forward content deltas. Shared by
// the NVIDIA and Mistral providers, which both emit `data: {...}` chunks.
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
  if (status === 401 || status === 403) return `Authentication failed. Please check the ${providerLabel} configuration.`;
  if (status === 404) return "That model is currently unavailable. Try a different one.";
  if (status === 429) return "Rate limit reached. Please wait a moment and try again.";
  if (status >= 500) return "The model service is temporarily unavailable. Please retry.";
  return `The model responded with an error (${status}).`;
}

const NVIDIA_PROXY_URL = "/api/nvidia";

async function generateNvidiaResponse(
  messages: ChatMessage[],
  modelId: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
) {
  const model = NVIDIA_MODELS[modelId] || DEFAULT_CHAT_MODEL;

  const response = await fetch(NVIDIA_PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: 0.7,
      top_p: 0.95,
      max_tokens: 2048,
    }),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("NVIDIA API error:", response.status, errText);
    throw new Error(friendlyHttpError(response.status, "NVIDIA proxy"));
  }

  await pumpOpenAiStream(response, onChunk);
}

async function generateMistralResponse(
  messages: ChatMessage[],
  modelId: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
) {
  const model = MISTRAL_MODELS[modelId] || "mistral-large-latest";

  const response = await fetch(MISTRAL_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      top_p: 0.95,
      max_tokens: 2048,
    }),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("Mistral proxy error:", response.status, errText);
    throw new Error(friendlyHttpError(response.status, "Mistral proxy"));
  }

  await pumpOpenAiStream(response, onChunk);
}

// ---------------------------------------------------------------------------
// Image generation
// ---------------------------------------------------------------------------
// Uses Pollinations (keyless, reliable). We preload the image and convert it to
// a data URL so it renders instantly and is persisted with the conversation.

export async function generateImageResponse(
  prompt: string,
  modelId: string,
  _images: Array<{ dataUrl?: string }>,
  signal?: AbortSignal,
): Promise<{ imageDataUrl: string; message: string }> {
  const cleanPrompt = prompt.replace(/^\s*(generate|create|make|draw|render|design|illustrate|paint|sketch)\b/i, "").trim() || prompt;
  const seed = Math.floor(Math.random() * 1_000_000);
  const encodedPrompt = encodeURIComponent(cleanPrompt);
  const model = IMAGE_MODELS[modelId] || "flux";
  const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&enhance=true&model=${model}&seed=${seed}`;

  // Fetch and inline the image so it survives reloads and renders immediately.
  try {
    const res = await fetch(imageUrl, { signal });
    if (!res.ok) throw new Error(`Image service error ${res.status}`);
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read generated image"));
      reader.readAsDataURL(blob);
    });
    return {
      imageDataUrl: dataUrl,
      message: `Here's your image for *"${cleanPrompt}"* ✨`,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    // Fall back to the raw URL if inlining fails (still renders in an <img>).
    return {
      imageDataUrl: imageUrl,
      message: `Here's your image for *"${cleanPrompt}"* ✨`,
    };
  }
}
