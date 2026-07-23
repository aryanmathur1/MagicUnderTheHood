// ============================================================================
// /api/ask — the ONLY server-side code and the ONLY live AI call on the site.
//
// It is a proxy: the browser posts a question here, and THIS function (running
// on Vercel) talks to Gemini using a secret key stored in Vercel's encrypted
// environment variables. The key is NEVER sent to the browser.
//
// Guardrails enforced here (see ARCHITECTURE.md):
//   • Answers come only from our transcripts. If the archive doesn't cover the
//     question, we say so plainly instead of guessing.
//   • Every answer returns its sources (episode + timestamp link) to verify.
//   • Quotes are copied from the transcript; we never invent them.
//   • Input length is capped and requests are rate-limited.
// ============================================================================
import { readFileSync } from 'node:fs';
import { models, rag, guard, site } from '../config/site.js';

// Load the pre-built vector index once per cold start. Using new URL(...) makes
// Vercel's file tracer bundle embeddings.json alongside this function.
let INDEX = { dim: 0, episodes: [], chunks: [] };
try {
  INDEX = JSON.parse(readFileSync(new URL('./embeddings.json', import.meta.url), 'utf8'));
} catch {
  /* index not built yet — handled below */
}
const TITLES = Object.fromEntries(INDEX.episodes.map((e) => [e.id, e.title]));

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';

// --- tiny in-memory rate limiter (per serverless instance) -------------------
const hits = new Map(); // ip -> number[] (timestamps)
function rateLimited(ip) {
  const now = Date.now();
  const win = guard.rateLimit.windowMs;
  const arr = (hits.get(ip) || []).filter((t) => now - t < win);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear(); // crude memory cap
  return arr.length > guard.rateLimit.maxRequests;
}

// --- math --------------------------------------------------------------------
function cosine(a, b) {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

async function gemini(path, body) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('server-missing-key');
  const res = await fetch(`${API_ROOT}/${path}?key=${key}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`gemini-${res.status}: ${await res.text()}`);
  return res.json();
}

async function embedQuery(text) {
  const data = await gemini(`models/${models.embedding}:embedContent`, {
    model: `models/${models.embedding}`,
    content: { parts: [{ text }] },
    taskType: 'RETRIEVAL_QUERY',
    outputDimensionality: models.embeddingDim,
  });
  return data.embedding.values;
}

function formatTimestamp(total) {
  const t = Math.max(0, Math.floor(total || 0));
  const s = t % 60,
    m = Math.floor(t / 60) % 60,
    h = Math.floor(t / 3600);
  const p = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

const SYSTEM = `You are the search assistant for "${site.name}", the interview podcast by ${site.team}.
You answer ONLY using the numbered excerpts provided by the user (these come from our podcast transcripts and from ${site.team}'s own website). Follow these rules strictly:
- If the excerpts do not contain enough information to answer, say so plainly (e.g. "The archive doesn't cover that yet.") and do not guess or use outside knowledge.
- Never invent quotes, names, team numbers, or facts. When you quote a guest, copy their words exactly from the excerpts; otherwise paraphrase and make clear it is a paraphrase.
- Keep the answer concise (2-5 sentences), friendly, and appropriate for a middle/high-school student audience.
- Base every claim on the excerpts and cite which excerpt numbers support it.`;

function readBody(req) {
  return new Promise((resolve) => {
    if (req.body) {
      resolve(typeof req.body === 'string' ? safeParse(req.body) : req.body);
      return;
    }
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(safeParse(data)));
    req.on('error', () => resolve({}));
  });
}
function safeParse(s) {
  try {
    return JSON.parse(s || '{}');
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  res.setHeader('content-type', 'application/json');
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed. Use POST.' }));
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  if (rateLimited(ip)) {
    res.statusCode = 429;
    return res.end(
      JSON.stringify({ error: 'Too many questions in a short time. Please wait a moment and try again.' })
    );
  }

  const body = await readBody(req);
  const question = String(body.question || '').trim();

  if (!question) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Please type a question.' }));
  }
  if (question.length > guard.maxQuestionChars) {
    res.statusCode = 400;
    return res.end(
      JSON.stringify({ error: `Question is too long (max ${guard.maxQuestionChars} characters).` })
    );
  }
  if (!INDEX.chunks.length) {
    res.statusCode = 503;
    return res.end(
      JSON.stringify({
        error:
          'Search isn’t set up yet — the transcript index hasn’t been generated. (Run the regenerate pipeline with an API key.)',
      })
    );
  }

  try {
    // 1) Embed the question and rank transcript chunks by cosine similarity.
    const qv = await embedQuery(question);
    const ranked = INDEX.chunks
      .map((c) => ({ c, score: cosine(qv, c.vector) }))
      .sort((a, b) => b.score - a.score);

    const top = ranked.slice(0, rag.topK);

    // 2) If nothing is even loosely relevant, be honest — don't guess.
    if (!top.length || top[0].score < rag.minRelevance) {
      return res.end(
        JSON.stringify({
          answer:
            'The archive doesn’t cover that yet. Try rephrasing, or ask about topics from the episodes we’ve published so far.',
          sources: [],
        })
      );
    }

    // 3) Build numbered context for the model.
    const context = top
      .map((t, i) => {
        const where =
          t.c.type === 'page'
            ? `${t.c.title} — team website`
            : `${TITLES[t.c.episodeId] || t.c.episodeId} @ ${formatTimestamp(t.c.start)}`;
        return `[${i + 1}] (${where})\n${t.c.text}`;
      })
      .join('\n\n');

    const prompt = `Question: ${question}

Transcript excerpts:
${context}

Answer the question using ONLY these excerpts. Respond as JSON:
{
  "answer": "<your answer, or a plain statement that the archive doesn't cover it>",
  "covered": <true if the excerpts actually answer the question, false otherwise>,
  "used": [<the excerpt numbers you relied on>],
  "quotes": [ { "n": <excerpt number>, "quote": "<a short VERBATIM quote from that excerpt that supports the answer>" } ]
}`;

    const data = await gemini(`models/${models.chat}:generateContent`, {
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    });

    const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '{}';
    const parsed = JSON.parse(raw);

    // 4) Build sources ourselves from the retrieved chunks so timestamps and
    //    episode names are always real (never model-fabricated).
    const usedNums = (parsed.covered ? parsed.used : []) || [];
    const quoteByN = new Map((parsed.quotes || []).map((q) => [q.n, q.quote]));
    const seen = new Set();
    const sources = [];
    for (const n of usedNums) {
      const t = top[n - 1];
      if (!t) continue;
      const quote = quoteByN.get(n);
      // Only surface a quote if it is genuinely present in the excerpt.
      const safeQuote = quote && t.c.text.includes(quote.trim()) ? quote.trim() : null;

      if (t.c.type === 'page') {
        const dedupeKey = `page:${t.c.url}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        sources.push({
          type: 'page',
          episode: t.c.title,
          timestamp: 'Team website',
          url: t.c.url,
          quote: safeQuote,
        });
      } else {
        const secs = Math.floor(t.c.start);
        const dedupeKey = `ep:${t.c.episodeId}:${secs}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        sources.push({
          type: 'episode',
          episode: TITLES[t.c.episodeId] || t.c.episodeId,
          timestamp: formatTimestamp(t.c.start),
          url: `https://www.youtube.com/watch?v=${t.c.episodeId}&t=${secs}s`,
          quote: safeQuote,
        });
      }
    }

    return res.end(
      JSON.stringify({
        answer:
          parsed.answer ||
          'The archive doesn’t cover that yet.',
        sources: parsed.covered ? sources : [],
      })
    );
  } catch (err) {
    const msg = String(err.message || err);
    res.statusCode = msg.includes('server-missing-key') ? 500 : 502;
    return res.end(
      JSON.stringify({
        error: msg.includes('server-missing-key')
          ? 'The search service isn’t configured yet (missing API key).'
          : 'The search service had a hiccup. Please try again in a moment.',
      })
    );
  }
}
