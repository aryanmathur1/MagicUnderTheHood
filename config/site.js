// Central config for the whole project. Non-programmers: the values most likely
// to need changing over time are the Gemini model names — Google rotates which
// models are free. If a model stops working, update it here (and in Vercel it is
// read from the same file), then re-run `npm run regenerate`.

export const site = {
  name: 'Magic Under the Hood',
  tagline: 'Searchable Podcast Archive',
  team: 'Metal Magic FTC Team #23362',
  location: 'Ashburn, VA',
  channelUrl: 'https://www.youtube.com/@metalmagicftc',
  brandSiteUrl: 'https://metalmagicftc.org',
  // Used to build absolute URLs in metadata/sitemap. Update after you know your
  // final domain (e.g. https://podcast.metalmagicftc.org).
  baseUrl: 'https://magic-under-the-hood.vercel.app',
};

// Gemini models. All are on Google's free tier as of this writing. If Google
// retires one, swap the id here. See https://ai.google.dev/gemini-api/docs/models
export const models = {
  // RUNTIME "Ask the Podcast" answers — called once per visitor question, so it
  // needs a generous free-tier daily limit. Flash-Lite is the high-volume free
  // tier. Using the moving "-latest" alias means it won't 404 when Google retires
  // a specific version (which is exactly what happened to gemini-2.5-flash).
  chat: 'gemini-flash-lite-latest',

  // BUILD-TIME enrichment (show notes + clips). Runs only a handful of times when
  // you add an episode, so we can afford a higher-quality model even though its
  // free daily cap is small. If you add many episodes in one day and hit a 429,
  // either wait a day or set this to 'gemini-flash-lite-latest' too.
  enrich: 'gemini-3.5-flash',

  // Build-time transcript translation. High volume (episodes × languages), so
  // it uses the high-quota Flash-Lite tier.
  translate: 'gemini-flash-lite-latest',

  // Turns text into vectors for semantic search. 768-dim by default here.
  // (Embeddings have a very generous free tier.)
  embedding: 'gemini-embedding-001',
  embeddingDim: 768,
};

// Languages the transcript is pre-translated into at build time. English is the
// original and always available. Add or remove entries here, then re-run
// `npm run regenerate` — translations are cached and only (re)generated when the
// transcript changes or you pass --force. `dir: 'rtl'` renders right-to-left.
export const languages = [
  { code: 'es', label: 'Español', name: 'Spanish' },
  { code: 'fr', label: 'Français', name: 'French' },
  { code: 'de', label: 'Deutsch', name: 'German' },
  { code: 'pt', label: 'Português', name: 'Portuguese' },
  { code: 'zh', label: '中文 (简体)', name: 'Simplified Chinese' },
  { code: 'hi', label: 'हिन्दी', name: 'Hindi' },
  { code: 'vi', label: 'Tiếng Việt', name: 'Vietnamese' },
  { code: 'ar', label: 'العربية', name: 'Arabic', dir: 'rtl' },
];
// To see which models your key can use, run:
//   node --env-file=.env -e 'fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`).then(r=>r.json()).then(d=>console.log(d.models.map(m=>m.name).join("\n")))'

// Retrieval-Augmented Generation (RAG) tuning.
export const rag = {
  // ~ words per transcript chunk that gets embedded. Smaller = more precise
  // citations, larger = more context per chunk.
  chunkWords: 220,
  chunkOverlapWords: 40,
  // How many transcript chunks to feed the model when answering a question.
  topK: 8,
  // First gate: below this cosine similarity we treat the archive as clearly not
  // covering the topic. Kept intentionally permissive because the model then makes
  // the real call (its "covered" flag) and we only show sources when it says yes.
  minRelevance: 0.45,
};

// Runtime safety limits for the /api/ask serverless proxy.
export const guard = {
  maxQuestionChars: 500,
  // Simple in-memory rate limit (per serverless instance). Not bulletproof, but
  // enough to stop casual abuse without a paid database. See ARCHITECTURE.md.
  rateLimit: {
    windowMs: 60_000, // 1 minute
    maxRequests: 12, // per IP per window
  },
};
