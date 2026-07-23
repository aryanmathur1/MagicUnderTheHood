// Thin wrappers around the yt-dlp CLI. yt-dlp is the right tool for reliably
// pulling YouTube metadata + caption tracks + audio. We never invent metadata.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileP = promisify(execFile);

// Allow a custom binary path but default to PATH lookup.
const YTDLP = process.env.YTDLP_PATH || 'yt-dlp';

async function ytdlp(args, opts = {}) {
  return execFileP(YTDLP, args, { maxBuffer: 64 * 1024 * 1024, ...opts });
}

/** Full metadata JSON for a video id. Throws if the video is unavailable. */
export async function fetchMetadata(id) {
  const url = `https://www.youtube.com/watch?v=${id}`;
  const { stdout } = await ytdlp(['-J', '--skip-download', '--no-warnings', url]);
  const info = JSON.parse(stdout);
  // Pick the best (largest) thumbnail that YouTube guarantees exists.
  const thumbnail =
    `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
  return {
    id,
    url,
    title: info.title,
    description: info.description || '',
    durationSeconds: info.duration ?? null,
    uploadDate: info.upload_date || null, // YYYYMMDD
    channel: info.channel || info.uploader || null,
    channelUrl: info.channel_url || info.uploader_url || null,
    thumbnail,
  };
}

/**
 * Try to download a caption track (real or auto-generated) as json3, which
 * carries per-segment start times. Returns the raw json3 string, or null if the
 * video has no captions at all. Prefers manual English, then auto English.
 */
export async function fetchCaptionsJson3(id) {
  const url = `https://www.youtube.com/watch?v=${id}`;
  const dir = await mkdtemp(join(tmpdir(), `muth-caps-${id}-`));
  try {
    await ytdlp([
      '--skip-download',
      '--write-subs',
      '--write-auto-subs',
      '--sub-langs', 'en.*,en',
      '--sub-format', 'json3',
      '--no-warnings',
      '-o', join(dir, '%(id)s.%(ext)s'),
      url,
    ]);
    const files = (await readdir(dir)).filter((f) => f.endsWith('.json3'));
    if (files.length === 0) return null;
    // Prefer a manual (non-auto) track if present. yt-dlp names auto tracks with
    // the lang code too, so just take the first available json3.
    const chosen = files.find((f) => !/auto/i.test(f)) || files[0];
    return await readFile(join(dir, chosen), 'utf8');
  } catch (err) {
    // No subtitles available is not fatal — caller falls back to audio.
    if (/no subtitles|requested format/i.test(String(err))) return null;
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Download audio as an mp3 for the Whisper/Gemini fallback path. Returns the
 * file path (caller is responsible for cleanup of the returned dir).
 */
export async function downloadAudio(id) {
  const url = `https://www.youtube.com/watch?v=${id}`;
  const dir = await mkdtemp(join(tmpdir(), `muth-audio-${id}-`));
  const out = join(dir, `${id}.mp3`);
  await ytdlp([
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '5',
    '--no-warnings',
    '-o', join(dir, '%(id)s.%(ext)s'),
    url,
  ]);
  return { path: out, dir };
}
