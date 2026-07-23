#!/usr/bin/env node
// ============================================================================
// REGENERATE — the offline build pipeline.
//
//   npm run regenerate                 # rebuild everything for every episode
//   npm run regenerate -- --episode ID # rebuild just one episode
//   npm run regenerate -- --force      # ignore caches, redo AI stages
//
// Add an episode by putting its YouTube id in config/episodes.json, then run
// this. Heavy work (transcription, show notes, clips, embeddings) happens HERE,
// once, and the results are committed as static JSON. The live website does no
// heavy AI work — see ARCHITECTURE.md.
//
// Stages that need NO api key:  metadata, transcript-from-captions.
// Stages that need GEMINI_API_KEY: transcript-from-audio (fallback), show notes,
// clips, embeddings. If the key is missing, those are skipped with a warning so
// you can still generate the free stages.
// ============================================================================
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { fetchMetadata, fetchCaptionsJson3, downloadAudio } from './lib/ytdlp.js';
import { parseJson3 } from './lib/captions.js';
import { chunkSegments, paragraphs } from './lib/chunk.js';
import { makeShowNotes, makeClips } from './lib/enrich.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'src', 'data', 'episodes');
const PUBLIC_DIR = join(ROOT, 'public');

const args = process.argv.slice(2);
const only = argValue('--episode');
const force = args.includes('--force');
const hasKey = !!process.env.GEMINI_API_KEY;

function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}
function log(...m) {
  console.log('  ', ...m);
}

async function loadConfig() {
  const raw = JSON.parse(await readFile(join(ROOT, 'config', 'episodes.json'), 'utf8'));
  let eps = raw.episodes || [];
  if (only) eps = eps.filter((e) => e.id === only);
  return eps;
}

async function getTranscript(meta) {
  // 1) Try YouTube caption track (free, accurate timings, no api key).
  const json3 = await fetchCaptionsJson3(meta.id);
  if (json3) {
    const segments = parseJson3(json3);
    if (segments.length) return { source: 'youtube-captions', segments };
  }
  // 2) Fallback: download audio and transcribe with Gemini (needs api key).
  if (!hasKey) {
    log('⚠︎ no captions and no GEMINI_API_KEY — transcript skipped.');
    return null;
  }
  log('no captions found — transcribing audio with Gemini (this is slower)…');
  const { transcribeAudio } = await import('./lib/gemini.js');
  const { path, dir } = await downloadAudio(meta.id);
  try {
    const buf = await readFile(path);
    const segments = await transcribeAudio(buf.toString('base64'));
    return { source: 'gemini-audio', segments: normalize(segments) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function normalize(segments) {
  return (segments || [])
    .filter((s) => s && s.text)
    .map((s) => ({ start: Math.max(0, Number(s.start) || 0), text: String(s.text).trim() }))
    .sort((a, b) => a.start - b.start);
}

async function buildEpisode(ep, index) {
  console.log(`\n▶ Episode ${ep.id}`);
  const outPath = join(DATA_DIR, `${ep.id}.json`);
  const prev = existsSync(outPath) ? JSON.parse(await readFile(outPath, 'utf8')) : {};

  // --- Stage 1: metadata (no key) ---
  log('fetching metadata…');
  const meta = await fetchMetadata(ep.id);

  // --- Stage 2: transcript (captions free; audio fallback needs key) ---
  let transcript = prev.transcript;
  if (force || !transcript || !transcript.segments?.length) {
    const t = await getTranscript(meta);
    if (t) {
      transcript = t;
      log(`transcript: ${transcript.segments.length} segments via ${transcript.source}`);
    } else {
      transcript = prev.transcript || { source: null, segments: [] };
    }
  } else {
    log(`transcript: reusing cached (${transcript.segments.length} segments)`);
  }

  const segments = transcript.segments || [];
  const record = {
    ...meta,
    order: index,
    transcript,
    paragraphs: paragraphs(segments),
    showNotes: prev.showNotes || null,
    clips: prev.clips || null,
    generatedAt: new Date().toISOString(),
  };

  // --- Stages 3 & 4: show notes + clips (need key) ---
  if (segments.length && hasKey && (force || !prev.showNotes)) {
    log('generating show notes…');
    record.showNotes = await makeShowNotes(meta, segments);
    log('finding shareable clips…');
    record.clips = await makeClips(meta, segments);
  } else if (segments.length && !hasKey) {
    log('⚠︎ GEMINI_API_KEY not set — show notes & clips skipped.');
  }

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(outPath, JSON.stringify(record, null, 2));
  log(`saved ${outPath.replace(ROOT + '/', '')}`);
  return record;
}

async function buildEmbeddings(records) {
  if (!hasKey) {
    log('⚠︎ GEMINI_API_KEY not set — embeddings index skipped.');
    return;
  }
  console.log('\n▶ Building embeddings index');
  const { embed } = await import('./lib/gemini.js');
  const index = [];
  for (const rec of records) {
    const chunks = chunkSegments(rec.transcript?.segments || []);
    log(`${rec.id}: ${chunks.length} chunks`);
    for (const c of chunks) {
      const vector = await embed(c.text, 'RETRIEVAL_DOCUMENT');
      index.push({ episodeId: rec.id, start: c.start, text: c.text, vector });
    }
  }
  // Written into /api (NOT /public): only the serverless function needs the
  // vectors, and it guarantees Vercel bundles the file with the function. The
  // large index is never downloaded by browsers.
  const episodes = records.map((r) => ({ id: r.id, title: r.title, url: r.url }));
  const API_DIR = join(ROOT, 'api');
  await mkdir(API_DIR, { recursive: true });
  await writeFile(
    join(API_DIR, 'embeddings.json'),
    JSON.stringify({ dim: index[0]?.vector.length || 0, episodes, chunks: index })
  );
  log(`saved api/embeddings.json (${index.length} chunks)`);
}

async function writeManifest(records) {
  // A small list the site uses to render the episodes index without loading
  // every full episode file.
  const manifest = records
    .sort((a, b) => a.order - b.order)
    .map((r) => ({
      id: r.id,
      title: r.title,
      durationSeconds: r.durationSeconds,
      uploadDate: r.uploadDate,
      thumbnail: r.thumbnail,
      summary: r.showNotes?.summary || null,
      hasTranscript: (r.transcript?.segments?.length || 0) > 0,
    }));
  await writeFile(join(ROOT, 'src', 'data', 'manifest.json'), JSON.stringify(manifest, null, 2));
  log(`saved src/data/manifest.json (${manifest.length} episodes)`);
}

async function main() {
  console.log('Magic Under the Hood — regenerate pipeline');
  console.log(hasKey ? '  GEMINI_API_KEY detected — all stages enabled.' : '  No GEMINI_API_KEY — running free stages only (metadata + captions).');
  const eps = await loadConfig();
  if (!eps.length) {
    console.error('No episodes to build. Check config/episodes.json' + (only ? ` for id ${only}` : ''));
    process.exit(1);
  }
  const records = [];
  for (let i = 0; i < eps.length; i++) records.push(await buildEpisode(eps[i], i));

  // When building a single episode, merge with existing files for the manifest
  // and embeddings so we don't clobber the others.
  let all = records;
  if (only) {
    all = [];
    const raw = JSON.parse(await readFile(join(ROOT, 'config', 'episodes.json'), 'utf8'));
    for (const e of raw.episodes) {
      const p = join(DATA_DIR, `${e.id}.json`);
      if (existsSync(p)) all.push(JSON.parse(await readFile(p, 'utf8')));
    }
  }

  await buildEmbeddings(all);
  await writeManifest(all);
  console.log('\n✓ Done.');
}

main().catch((err) => {
  console.error('\n✗ Pipeline failed:', err.message);
  process.exit(1);
});
