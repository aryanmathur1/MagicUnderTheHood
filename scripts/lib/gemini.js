// Minimal Gemini REST client using global fetch (Node 18+). No SDK dependency,
// so the exact same calling style works in the Vercel serverless function.
//
// Reads GEMINI_API_KEY from the environment. NEVER hardcode a key here.
import { models } from '../../config/site.js';

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';

function key() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) {
    throw new Error(
      'GEMINI_API_KEY is not set. Add it to a local .env (see .env.example) ' +
        'or export it before running the pipeline.'
    );
  }
  return k;
}

async function post(path, body, { retries = 4 } = {}) {
  const url = `${API_ROOT}/${path}?key=${key()}`;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (netErr) {
      // Transient network hiccup (ECONNRESET, fetch failed) — back off and retry.
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        lastErr = netErr;
        continue;
      }
      throw netErr;
    }
    if (res.ok) return res.json();
    const text = await res.text();
    // 429 (rate limit) / 5xx (overloaded) — back off and retry.
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const waitMs = 2000 * (attempt + 1);
      await new Promise((r) => setTimeout(r, waitMs));
      lastErr = new Error(`Gemini ${res.status}: ${text}`);
      continue;
    }
    throw new Error(`Gemini ${res.status}: ${text}`);
  }
  throw lastErr;
}

/**
 * Generate text. Returns a plain string. When `json` is true we ask Gemini for
 * a JSON response and parse it.
 */
export async function generate(prompt, { system, json = false, temperature = 0.3, model = models.enrich, maxOutputTokens = 8192 } = {}) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens,
      ...(json ? { responseMimeType: 'application/json' } : {}),
    },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  // JSON mode is almost always valid, but the model can occasionally emit an
  // unescaped character inside a verbatim quote. Re-sample a few times rather
  // than failing the whole pipeline over one bad batch.
  const attempts = json ? 3 : 1;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    const data = await post(`models/${model}:generateContent`, body);
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
    if (!json) return text;
    try {
      return JSON.parse(stripFences(text));
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Gemini returned unparseable JSON after ${attempts} tries: ${lastErr.message}`);
}

/** Transcribe an audio file (base64) into timed segments via Gemini multimodal. */
export async function transcribeAudio(base64Mp3) {
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              'Transcribe this podcast audio in English. Return JSON only: an ' +
              'array of objects {"start": <seconds from start as a number>, ' +
              '"text": "<what is said>"}, one object roughly every sentence or ' +
              'two. Do not summarize, transcribe verbatim.',
          },
          { inlineData: { mimeType: 'audio/mp3', data: base64Mp3 } },
        ],
      },
    ],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' },
  };
  const data = await post(`models/${models.chat}:generateContent`, body);
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '[]';
  return JSON.parse(stripFences(text));
}

/** Embed a single string into a vector. */
export async function embed(text, taskType = 'RETRIEVAL_DOCUMENT') {
  const body = {
    model: `models/${models.embedding}`,
    content: { parts: [{ text }] },
    taskType,
    outputDimensionality: models.embeddingDim,
  };
  const data = await post(`models/${models.embedding}:embedContent`, body);
  return data.embedding.values;
}

function stripFences(s) {
  return s.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
}
