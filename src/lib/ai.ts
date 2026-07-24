// All chat models are routed through NVIDIA NIM (requires API key)
// The /api/nvidia proxy in vite.config.ts handles CORS and streaming.

// Default flagship shown as "Flyer". Points at a verified-working model
// (openai/gpt-oss-120b — confirmed live, ~30s first token on 2026-07-21)
export const DEFAULT_CHAT_MODEL = "mistral-large-latest";

// ---------------------------------------------------------------------------
// Model → NVIDIA NIM / Mistral ID mapping
// ---------------------------------------------------------------------------

// Maps our internal model IDs to EXACT live model IDs.
// Verified live against Mistral API and NVIDIA NIM catalog.
// Only real, working models are kept. Fake / 404 models have been removed.
export const MODEL_REGISTRY: Record<
  string,
  { nvidiaId: string; kind: 'Chat' | 'Vision' | 'Image'; provider?: 'nvidia' | 'mistral'; mistralId?: string }
> = {
  // ── Mistral Models (Mistral API — MISTRAL_API_KEY) ──
  "mistral-large-latest": { nvidiaId: "", provider: "mistral", mistralId: "mistral-large-latest", kind: "Chat" },
  "mistral-large":        { nvidiaId: "", provider: "mistral", mistralId: "mistral-large-latest", kind: "Chat" },
  "mistral-medium":       { nvidiaId: "", provider: "mistral", mistralId: "mistral-medium-latest",kind: "Chat" },
  "mistral-small":        { nvidiaId: "", provider: "mistral", mistralId: "mistral-small-latest", kind: "Chat" },
  "pixtral-12b":          { nvidiaId: "", provider: "mistral", mistralId: "pixtral-12b-2409",      kind: "Chat" },
  "codestral-latest":     { nvidiaId: "", provider: "mistral", mistralId: "codestral-latest",     kind: "Chat" },
  "devstral-latest":      { nvidiaId: "", provider: "mistral", mistralId: "devstral-latest",      kind: "Chat" },
  "ministral-8b":         { nvidiaId: "", provider: "mistral", mistralId: "ministral-8b-latest",  kind: "Chat" },

  // ── Verified NVIDIA NIM Chat / Reasoning Models ──
  "deepseek-v4-pro":   { nvidiaId: "deepseek-ai/deepseek-v4-pro",             kind: "Chat" },
  "deepseek-v4-flash": { nvidiaId: "deepseek-ai/deepseek-v4-flash",           kind: "Chat" },
  "llama-4-maverick":  { nvidiaId: "meta/llama-4-maverick-17b-128e-instruct", kind: "Chat" },
  "minimax-m3":        { nvidiaId: "minimaxai/minimax-m3",                    kind: "Chat" },
  "minimax-m2.7":      { nvidiaId: "minimaxai/minimax-m2.7",                  kind: "Chat" },
  "qwen-3-next-80b":   { nvidiaId: "qwen/qwen3-next-80b-a3b-instruct",        kind: "Chat" },
  "llama-3.3-70b":     { nvidiaId: "meta/llama-3.3-70b-instruct",             kind: "Chat" },
  "llama-70b":         { nvidiaId: "meta/llama-3.1-70b-instruct",             kind: "Chat" },
  "llama-8b":          { nvidiaId: "meta/llama-3.1-8b-instruct",              kind: "Chat" },
  "nemotron-super-49b":{ nvidiaId: "nvidia/llama-3.3-nemotron-super-49b-v1.5",kind: "Chat" },
  "nemotron-nano-9b":  { nvidiaId: "nvidia/nvidia-nemotron-nano-9b-v2",       kind: "Chat" },
  "step-3.7-flash":    { nvidiaId: "stepfun-ai/step-3.7-flash",              kind: "Chat" },

  // ── Vision (image understanding engines) ──────
  "vision-engine":     { nvidiaId: "meta/llama-3.2-11b-vision-instruct",      kind: "Vision" }, // primary fallback
  "vision-engine-2":   { nvidiaId: "nvidia/llama-3.1-nemotron-nano-vl-8b-v1", kind: "Vision" },
  "vision-engine-3":   { nvidiaId: "meta/llama-3.2-90b-vision-instruct",      kind: "Vision" },

  // ── Image Generation Models (via Pollinations) ──
  "flux":              { nvidiaId: "pollinations", kind: "Image" },
  "gptimage":          { nvidiaId: "pollinations", kind: "Image" },
  "turbo":             { nvidiaId: "pollinations", kind: "Image" },
  "sana":              { nvidiaId: "pollinations", kind: "Image" },
  "stable-diffusion":  { nvidiaId: "pollinations", kind: "Image" },
};

export function getNvidiaId(modelId: string): string {
  return MODEL_REGISTRY[modelId]?.nvidiaId || "deepseek-v4-flash";
}

// The internal vision-capable model any non-vision chat model routes through when an image is attached.
export const VISION_ENGINE_MODEL = "vision-engine";

export const VISION_ENGINE_FALLBACKS = ["vision-engine", "vision-engine-2", "vision-engine-3"];

export function isMistralModel(modelId: string): boolean {
  return MODEL_REGISTRY[modelId]?.provider === "mistral";
}

export function isVisionCapableModel(modelId: string): boolean {
  // Mistral Large Latest & Pixtral models support vision natively on Mistral API
  if (modelId === "mistral-large-latest" || modelId === "mistral-large" || modelId === "pixtral-12b") return true;
  return isVisionModel(modelId);
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

// Same "bring your own key" contract for Mistral. Undefined = call the
// /api/mistral proxy keyless and let the server inject MISTRAL_API_KEY.
const getUserMistralApiKey = () => {
  const localKey = localStorage.getItem("VITE_MISTRAL_API_KEY") || localStorage.getItem("MISTRAL_API_KEY");
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
// Chat streaming — via NVIDIA NIM or the Mistral API
// ---------------------------------------------------------------------------

export async function generateChatResponse(
  messages: ChatMessage[],
  modelId: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
) {
  // Mistral models go through the dedicated /api/mistral proxy (Mistral API,
  // MISTRAL_API_KEY). Everything else goes through /api/nvidia (NVIDIA NIM).
  if (isMistralModel(modelId)) {
    return generateMistralResponse(messages, modelId, onChunk, signal);
  }

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
// Vision — with automatic fallback across engines
// ---------------------------------------------------------------------------

// Route an image-analysis turn through the vision engines in order. The first
// engine that actually streams content wins. If an engine errors BEFORE any
// token arrives (404 pulled model, cold-start timeout, 5xx), the next engine is
// tried transparently. Once tokens have started we never switch — that would
// duplicate text mid-stream. Returns the id of the engine that answered.
export async function generateVisionResponse(
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  let lastErr: unknown;
  for (const engineId of VISION_ENGINE_FALLBACKS) {
    let started = false;
    try {
      await generateChatResponse(
        messages,
        engineId,
        (delta) => { started = true; onChunk(delta); },
        signal,
      );
      return engineId; // completed successfully
    } catch (err) {
      // Never retry a user-initiated abort, and never fall back once the model
      // has already emitted content (avoids duplicated/garbled output).
      if (err instanceof Error && err.name === "AbortError") throw err;
      if (started) throw err;
      lastErr = err;
      // else: try the next engine in the chain
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("All vision engines are currently unavailable. Please try again.");
}

async function generateMistralResponse(
  messages: ChatMessage[],
  modelId: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
) {
  const mistralModel = MODEL_REGISTRY[modelId]?.mistralId || "mistral-large-latest";

  const userKey = getUserMistralApiKey();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userKey) headers["X-Mistral-Api-Key"] = userKey;

  const response = await fetch("/api/mistral", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: mistralModel,
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
    console.error("Mistral proxy error:", response.status, errText);
    try {
      const parsed = JSON.parse(errText);
      if (parsed.detail) throw new Error(typeof parsed.detail === "string" ? parsed.detail : JSON.stringify(parsed.detail));
      if (parsed.error && typeof parsed.error === "string") throw new Error(parsed.error);
    } catch (e) {
      if (e instanceof Error && e.message !== errText) throw e;
    }
    throw new Error(friendlyHttpError(response.status, "Mistral"));
  }

  // The Mistral API is OpenAI-compatible on the wire, so the same SSE pump works.
  await pumpOpenAiStream(response, onChunk);
}

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

// ---------------------------------------------------------------------------
// Prompt Engineering — 1000-word Master Prompts via Chat Model
// ---------------------------------------------------------------------------

// System prompt that turns any chat model into a Master Vision Prompt Engineer.
// When a user uploads files/images, the chat model first generates an exhaustive
// ~1000-word master analysis prompt that is supplied internally to the vision engine.
const VISION_PROMPT_ENGINEER_SYSTEM = [
  "You are an expert Vision & Document Prompt Engineer AI.",
  "The user uploaded file(s)/image(s) and provided a question or request.",
  "Your task is to expand the user's input into an EXHAUSTIVE, MASTER-LEVEL VISUAL ANALYSIS PROMPT (~800-1000 words).",
  "This master prompt will be passed internally along with the images to the Vision AI Model.",
  "",
  "STRUCTURE YOUR GENERATED MASTER VISION PROMPT TO DIRECT THE VISION ENGINE TO COVER:",
  "1. PRIMARY OBJECTIVE & QUERY EXPANSION: Formulate the exact user goal into deep analytical objectives.",
  "2. EXHAUSTIVE VISUAL & SCENE DECONSTRUCTION: Instruct the vision model to inventory all objects, spatial layouts, colors, lighting, textures, background/foreground context, and visual relationships.",
  "3. VERBATIM OCR & TEXT EXTRACTION DIRECTIVES: Direct the vision model to scan and transcribe all visible text, numbers, code snippets, headers, and labels verbatim in fenced code blocks.",
  "4. TECHNICAL & DOMAIN ANALYSIS: Require the vision model to analyze any diagrams, flowcharts, UI components, mathematical equations, or technical schematics step-by-step.",
  "5. STRUCTURED RESPONSE GUIDELINES: Tell the vision model to structure its response with clear markdown headings, bolded key terms, bullet points, and actionable conclusions.",
  "",
  "RULES:",
  "- Output ONLY the final generated master vision prompt text — no preamble, no markdown code block wrappers around the whole prompt, no conversational intro.",
  "- Make the prompt expansive, highly detailed, and thorough (~800-1000 words).",
].join("\n");

export async function craftVisionPrompt(
  userPrompt: string,
  attachmentNames: string[],
  chatModelId: string,
  signal?: AbortSignal,
): Promise<string> {
  const fileContext = attachmentNames.length > 0
    ? `[Uploaded files: ${attachmentNames.join(", ")}]`
    : "";
  const base = `${userPrompt} ${fileContext}`.trim() || "Analyze the uploaded file/image in detail.";

  try {
    let crafted = "";
    await generateChatResponse(
      [
        { role: "system", content: VISION_PROMPT_ENGINEER_SYSTEM },
        { role: "user", content: base },
      ],
      chatModelId,
      (delta) => { crafted += delta; },
      signal,
    );
    const cleaned = crafted
      .replace(/<\s*think\s*>[\s\S]*?<\s*\/\s*think\s*>/gi, "")
      .trim();
    return cleaned.length >= 20 ? cleaned : base;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    return base;
  }
}

// System prompt that turns any chat model into an expansive Master Image Prompt Engineer.
// The chat model expands a user's image request into a ~1000-word master generation prompt.
const IMAGE_PROMPT_ENGINEER_SYSTEM = [
  "You are an expert master Image Prompt Engineer for text-to-image AI diffusion models.",
  "The user wants an image generated. Expand their request into an EXHAUSTIVE, ULTRA-DETAILED MASTER GENERATION PROMPT (~500-1000 words).",
  "",
  "COVER ALL OF THE FOLLOWING IN THE GENERATED MASTER PROMPT:",
  "1. SUBJECT & CHARACTER DETAILS: Precise anatomical, structural, facial, clothing, material, posture, and emotional expressions.",
  "2. SCENE ENVIRONMENT & COMPOSITION: Foreground, midground, background architecture, depth of field, camera distance/angle, framing.",
  "3. LIGHTING & COLOR HARMONY: Specific light sources, volumetric rays, shadow gradients, ambient bounce, color palette, color grading.",
  "4. ARTISTIC MEDIUM & STYLE: Photography parameters (85mm lens, f/1.4 aperture, cinematic 35mm film grain) OR digital art medium (3D octane render, anime illustration, oil painting, vector emblem).",
  "5. TEXTURES & MICRO-DETAILS: Surface roughness, skin pores, fabric weaves, atmospheric fog, reflections, intricate patterns.",
  "6. RENDERING QUALITY TAGS: 8k resolution, photorealistic, sharp focus, masterpiece, cinematic lighting, ultra-detailed.",
  "",
  "RULES:",
  "- Output ONLY the final expanded master prompt text — no preambles, no conversational intro, no quotes.",
  "- Keep the user's original core subject intact while enriching every visual detail.",
].join("\n");

// Have the selected chat model craft the image prompt.
export async function craftImagePrompt(
  userPrompt: string,
  chatModelId: string,
  signal?: AbortSignal,
): Promise<string> {
  const base = (userPrompt || "").trim();
  if (!base) return buildImagePrompt(userPrompt);

  try {
    let crafted = "";
    await generateChatResponse(
      [
        { role: "system", content: IMAGE_PROMPT_ENGINEER_SYSTEM },
        { role: "user", content: base },
      ],
      chatModelId,
      (delta) => { crafted += delta; },
      signal,
    );
    const cleaned = crafted
      .replace(/<\s*think\s*>[\s\S]*?<\s*\/\s*think\s*>/gi, "")
      .replace(/^["'`\s]+|["'`\s]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned.length >= 8 ? cleaned : buildImagePrompt(userPrompt);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    return buildImagePrompt(userPrompt);
  }
}

// Image-model fallback order: the requested model first, then 2 proven
// alternates. If a Pollinations model 500s / times out (a model can go down or
// get gated to the paid tier), the next one is tried so generation still
// succeeds. "flux" (quality) → "turbo" (fast) → "stable-diffusion" (baseline).
const IMAGE_MODEL_FALLBACKS = ["flux", "turbo", "stable-diffusion"];

function imageFallbackChain(modelId: string): string[] {
  const primary = pollinationsModelFor(modelId);
  // Primary first, then the standard fallbacks, de-duplicated.
  return [...new Set([primary, ...IMAGE_MODEL_FALLBACKS])];
}

export async function generateImageResponse(
  prompt: string,
  modelId: string,
  _images: Array<{ dataUrl?: string }>,
  signal?: AbortSignal,
): Promise<{ imageDataUrl: string; message: string }> {
  // Pollinations.ai is keyless and CORS-friendly, so we call it directly.
  // `prompt` here is already the final, model-crafted (or enhanced) prompt.
  const enhancedPrompt = (prompt || "").trim() || buildImagePrompt("");
  const encoded = encodeURIComponent(enhancedPrompt);

  let lastErr: unknown;
  for (const model of imageFallbackChain(modelId)) {
    const url = `https://image.pollinations.ai/prompt/${encoded}?nologo=true&enhance=true&model=${model}`;
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) {
        lastErr = new Error(`Image generation failed (${model}): ${res.status} ${res.statusText}`);
        continue; // try the next model in the chain
      }
      const blob = await res.blob();
      // Guard against a 200 that isn't actually an image (some tiers return an
      // HTML/error page with a 200) — treat a non-image / empty body as failure.
      if (blob.size === 0 || (blob.type && !blob.type.startsWith("image/"))) {
        lastErr = new Error(`Image generation returned no image (${model}).`);
        continue;
      }
      return {
        imageDataUrl: URL.createObjectURL(blob),
        message: "Here is your generated image:",
      };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      lastErr = err;
      // try the next model in the chain
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error("Image generation is temporarily unavailable. Please try again.");
}
