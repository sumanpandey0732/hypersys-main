import { defineConfig, type ViteDevServer, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// ---------------------------------------------------------------------------
// Local API proxy plugin — streams NVIDIA / Mistral / Pollinations requests
// during `npm run dev` so you don't need Firebase emulators running.
// ---------------------------------------------------------------------------

function localApiProxy(): Plugin {
  return {
    name: "local-api-proxy",
    configureServer(server: ViteDevServer) {
      // Handle all /api/* routes BEFORE Vite's middleware.
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || "";
        if (!url.startsWith("/api/")) return next();

        // CORS for local dev
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Api-Key, X-Nvidia-Api-Key, X-Mistral-Api-Key");
        res.setHeader("Access-Control-Max-Age", "3600");

        if (req.method === "OPTIONS") {
          res.writeHead(204);
          res.end();
          return;
        }

        // Read request body
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        const rawBody = Buffer.concat(chunks).toString("utf-8");
        let body: Record<string, unknown> = {};
        try { body = JSON.parse(rawBody); } catch { /* ignore */ }

        const route = url.replace(/^\/api\//, "").replace(/\?.*$/, "");

        try {
          if (route === "nvidia") {
            await proxyNvidia(req, res, body);
          } else if (route === "mistral") {
            await proxyMistral(req, res, body);
          } else if (route === "pollinations") {
            await proxyPollinations(req, res, body);
          } else if (route === "search") {
            await proxySearch(req, res, body);
          } else {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Unknown endpoint" }));
          }
        } catch (err: unknown) {
          console.error(`[api/${route}] error:`, err);
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
          }
          res.end(JSON.stringify({ error: "Internal proxy error" }));
        }
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function proxyNvidia(
  req: { headers: Record<string, string | string[] | undefined> },
  res: { writeHead: Function; setHeader: Function; write: Function; end: Function; headersSent: boolean },
  body: Record<string, unknown>,
) {
  const key =
    h(req.headers, "x-nvidia-api-key") ||
    h(req.headers, "authorization")?.split(" ")[1] ||
    process.env.VITE_NVIDIA_API_KEY ||
    process.env.NVIDIA_API_KEY;

  if (!key) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "NVIDIA API key is missing. Set VITE_NVIDIA_API_KEY in your .env file or enter it in Settings." }));
    return;
  }

  const { messages, model, temperature, top_p, max_tokens } = body as any;
  if (!Array.isArray(messages) || messages.length === 0) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "`messages` array is required" }));
    return;
  }

  const upstream = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      model: model || "z-ai/glm-5.2",
      messages,
      stream: true,
      temperature: temperature ?? 0.7,
      top_p: top_p ?? 0.95,
      max_tokens: max_tokens ?? 2048,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    console.error("[nvidia] upstream error:", upstream.status, text);
    res.writeHead(upstream.status || 502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "nvidia_upstream_error", status: upstream.status, detail: text }));
    return;
  }

  await streamResponse(upstream, res);
}

async function proxyMistral(
  req: { headers: Record<string, string | string[] | undefined> },
  res: { writeHead: Function; setHeader: Function; write: Function; end: Function; headersSent: boolean },
  body: Record<string, unknown>,
) {
  const key =
    h(req.headers, "x-mistral-api-key") ||
    h(req.headers, "authorization")?.split(" ")[1] ||
    process.env.VITE_MISTRAL_API_KEY ||
    process.env.MISTRAL_API_KEY;

  if (!key) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Mistral API key is missing." }));
    return;
  }

  const { messages, model, temperature, top_p, max_tokens } = body as any;

  const upstream = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      model: model || "mistral-large-latest",
      messages,
      stream: true,
      temperature: temperature ?? 0.7,
      top_p: top_p ?? 0.95,
      max_tokens: max_tokens ?? 2048,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    console.error("[mistral] upstream error:", upstream.status, text);
    res.writeHead(upstream.status || 502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "mistral_upstream_error", status: upstream.status, detail: text }));
    return;
  }

  await streamResponse(upstream, res);
}

async function proxyPollinations(
  _req: unknown,
  res: { writeHead: Function; setHeader: Function; write: Function; end: Function; headersSent: boolean },
  body: Record<string, unknown>,
) {
  const { messages, model } = body as any;

  const upstream = await fetch("https://text.pollinations.ai/openai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model || "openai",
      messages,
      stream: true,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    res.writeHead(upstream.status || 502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "pollinations_upstream_error", detail: text }));
    return;
  }

  await streamResponse(upstream, res);
}

async function proxySearch(
  _req: unknown,
  res: { writeHead: Function; setHeader: Function; write: Function; end: Function; headersSent: boolean },
  body: Record<string, unknown>,
) {
  const serpKey = process.env.VITE_SERP_API_KEY || process.env.VITE_SERPAPI_API_KEY || process.env.SERPAPI_API_KEY;
  if (!serpKey) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "SERPAPI_API_KEY is not configured" }));
    return;
  }

  const query = (body.query as string) || "";
  const params = new URLSearchParams({ q: query, api_key: serpKey, engine: "google", num: "5" });
  const upstream = await fetch(`https://serpapi.com/search.json?${params}`);
  const data = await upstream.json();
  const results = (data.organic_results || []).slice(0, 5).map((r: any) => ({
    title: r.title,
    link: r.link,
    snippet: r.snippet,
  }));

  const answerBox = data.answer_box ? { 
    title: data.answer_box.title || null, 
    answer: data.answer_box.answer || data.answer_box.snippet || null 
  } : null;

  const related = data.related_searches ? data.related_searches.map((r: any) => r.query) : [];

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ query, answerBox, results, related }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function h(headers: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const val = headers[key] || headers[key.toLowerCase()];
  return Array.isArray(val) ? val[0] : val || undefined;
}

async function streamResponse(
  upstream: Response,
  res: { writeHead: Function; setHeader: Function; write: Function; end: Function; headersSent: boolean },
) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  const reader = upstream.body!.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  } finally {
    res.end();
  }
}

// ---------------------------------------------------------------------------

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    // NOTE: The localApiProxy() plugin handles /api/* routes directly —
    // no need for the external Firebase emulator proxy anymore.
  },
  plugins: [react(), localApiProxy()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
