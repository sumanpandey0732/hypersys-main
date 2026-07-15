// Vercel serverless function: POST /api/search
// Runs a SerpApi Google search server-side and returns condensed results.
// Set SERPAPI_API_KEY in the Vercel project env (see `vercel env add`).

const SERPAPI_URL = "https://serpapi.com/search.json";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const key = process.env.SERPAPI_API_KEY || process.env.VITE_SERP_API_KEY;
  if (!key) {
    res.status(500).json({ error: "SERPAPI_API_KEY is not configured" });
    return;
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};
  const { query, num } = body;
  if (!query || typeof query !== "string") {
    res.status(400).json({ error: "`query` string is required" });
    return;
  }

  const params = new URLSearchParams({
    engine: "google",
    q: query,
    num: String(Math.min(Math.max(Number(num) || 5, 1), 10)),
    api_key: key,
  });

  const upstream = await fetch(`${SERPAPI_URL}?${params.toString()}`);
  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    console.error("SerpApi upstream error:", upstream.status, text);
    res.status(upstream.status || 502).json({ error: "serpapi_upstream_error" });
    return;
  }

  const data = await upstream.json();

  const answerBox = data.answer_box
    ? { title: data.answer_box.title || null, answer: data.answer_box.answer || data.answer_box.snippet || null }
    : null;

  const results = (data.organic_results || []).slice(0, 6).map((r) => ({
    title: r.title || "",
    snippet: r.snippet || "",
    link: r.link || "",
    source: r.source || null,
    date: r.date || null,
  }));

  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
  res.status(200).json({
    query,
    answerBox,
    results,
    related: (data.related_questions || []).slice(0, 3).map((q) => q.question).filter(Boolean),
  });
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
