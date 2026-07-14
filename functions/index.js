import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

// Secrets are configured with the Firebase CLI, never committed:
//   firebase functions:secrets:set MISTRAL_API_KEY
//   firebase functions:secrets:set SERPAPI_API_KEY
const MISTRAL_API_KEY = defineSecret("MISTRAL_API_KEY");
const SERPAPI_API_KEY = defineSecret("SERPAPI_API_KEY");

const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";
const SERPAPI_URL = "https://serpapi.com/search.json";

// Same-origin in production (Hosting rewrite), so CORS is not needed. We still
// send permissive headers so the emulator / direct calls work in development.
function setCors(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
}

/**
 * Unified API handler. Routed at /api/** by the Hosting rewrite:
 *   POST /api/mistral  -> streams a Mistral chat completion (SSE passthrough)
 *   POST /api/search   -> returns condensed SerpApi organic results as JSON
 */
export const api = onRequest(
  {
    secrets: [MISTRAL_API_KEY, SERPAPI_API_KEY],
    cors: false,
    memory: "256MiB",
    timeoutSeconds: 120,
    maxInstances: 10,
  },
  async (req, res) => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    // req.path is the portion after the function mount. Match on suffix so it
    // works both behind the /api rewrite and when called directly.
    const path = (req.path || "").replace(/\/+$/, "");

    try {
      if (path.endsWith("/mistral")) {
        await handleMistral(req, res);
        return;
      }
      if (path.endsWith("/search")) {
        await handleSearch(req, res);
        return;
      }
      res.status(404).json({ error: "Unknown endpoint" });
    } catch (err) {
      console.error("API handler error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal error" });
      } else {
        res.end();
      }
    }
  }
);

async function handleMistral(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { messages, model, temperature, top_p, max_tokens } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "`messages` array is required" });
    return;
  }

  const upstream = await fetch(MISTRAL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MISTRAL_API_KEY.value()}`,
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
    console.error("Mistral upstream error:", upstream.status, text);
    res.status(upstream.status || 502).json({
      error: "mistral_upstream_error",
      status: upstream.status,
    });
    return;
  }

  // Stream the SSE bytes straight back to the browser.
  res.status(200);
  res.set("Content-Type", "text/event-stream; charset=utf-8");
  res.set("Cache-Control", "no-cache, no-transform");
  res.set("Connection", "keep-alive");

  const reader = upstream.body.getReader();
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

async function handleSearch(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { query, num } = req.body || {};
  if (!query || typeof query !== "string") {
    res.status(400).json({ error: "`query` string is required" });
    return;
  }

  const params = new URLSearchParams({
    engine: "google",
    q: query,
    num: String(Math.min(Math.max(Number(num) || 5, 1), 10)),
    api_key: SERPAPI_API_KEY.value(),
  });

  const upstream = await fetch(`${SERPAPI_URL}?${params.toString()}`);
  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    console.error("SerpApi upstream error:", upstream.status, text);
    res.status(upstream.status || 502).json({ error: "serpapi_upstream_error" });
    return;
  }

  const data = await upstream.json();

  // Condense to only what the model needs, to keep the prompt small.
  const answerBox = data.answer_box
    ? {
        title: data.answer_box.title || null,
        answer: data.answer_box.answer || data.answer_box.snippet || null,
      }
    : null;

  const results = (data.organic_results || []).slice(0, 6).map((r) => ({
    title: r.title || "",
    snippet: r.snippet || "",
    link: r.link || "",
    source: r.source || null,
    date: r.date || null,
  }));

  res.set("Cache-Control", "public, max-age=300");
  res.status(200).json({
    query,
    answerBox,
    results,
    related: (data.related_questions || []).slice(0, 3).map((q) => q.question).filter(Boolean),
  });
}
