// Vercel serverless function: POST /api/search
// Runs a SerpApi Google search server-side and returns condensed results.
// Set SERPAPI_API_KEY in the Vercel project env (see `vercel env add`).

import { applyGuard } from "./_guard.js";

const SERPAPI_URL = "https://serpapi.com/search.json";

export default async function handler(req, res) {
  if (applyGuard(req, res)) return;
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

  const organic = (data.organic_results || []).map((r) => ({
    title: r.title || "",
    snippet: r.snippet || "",
    link: r.link || "",
    source: r.source || null,
    date: r.date || null,
  }));

  const news = (data.news_results || []).map((r) => ({
    title: r.title || "",
    snippet: r.snippet || "",
    link: r.link || "",
    source: r.source || null,
    date: r.date || null,
  }));

  const topStories = (data.top_stories || []).map((r) => ({
    title: r.title || "",
    snippet: r.original_snippet || r.snippet || "",
    link: r.link || "",
    source: r.source || null,
    date: r.date || null,
  }));

  const combined = [...organic, ...news, ...topStories];

  const seenLinks = new Set();
  const results = combined.filter((r) => {
    if (!r.title || (!r.snippet && !r.link)) return false;
    if (r.link && seenLinks.has(r.link)) return false;
    if (r.link) seenLinks.add(r.link);
    return true;
  }).slice(0, 6);

  const ab = data.answer_box || data.knowledge_graph || data.sports_results;
  const overview = data.ai_overview?.text_blocks
    ?.map((b) => b.snippet)
    .filter(Boolean)
    .join(" ");
  const answerBox = ab
    ? { title: ab.title || ab.name || null, answer: ab.answer || ab.snippet || ab.description || null }
    : overview
    ? { title: "AI Overview", answer: overview }
    : null;

  const related = [
    ...(data.related_questions || []).map((q) => q.question),
    ...(data.related_searches || []).map((r) => r.query),
  ].filter(Boolean).slice(0, 4);

  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
  res.status(200).json({
    query,
    answerBox,
    results,
    related,
  });
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
