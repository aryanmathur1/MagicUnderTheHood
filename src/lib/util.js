// Small display helpers shared across pages.

/** Seconds → "M:SS" or "H:MM:SS". */
export function formatTimestamp(totalSeconds) {
  const t = Math.max(0, Math.floor(totalSeconds || 0));
  const s = t % 60;
  const m = Math.floor(t / 60) % 60;
  const h = Math.floor(t / 3600);
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Human duration like "5 min". */
export function humanDuration(seconds) {
  if (!seconds) return '';
  const m = Math.round(seconds / 60);
  return `${m} min`;
}

/** YouTube deep link to an exact second. */
export function youtubeAt(id, seconds) {
  return `https://www.youtube.com/watch?v=${id}&t=${Math.floor(seconds || 0)}s`;
}

/** "20260205" → "Feb 5, 2026". */
export function formatUploadDate(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return '';
  const y = +yyyymmdd.slice(0, 4);
  const m = +yyyymmdd.slice(4, 6);
  const d = +yyyymmdd.slice(6, 8);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Pull the short team name / number out of an episode title if present. */
export function teamFromTitle(title) {
  const m = title.match(/(\d{4,6})/);
  return m ? `Team ${m[1]}` : null;
}

/**
 * A "speech waveform" for an episode: how densely people are talking in each of
 * `bars` equal time slices, from the caption timing. Values are 0.12..1.
 * It's real data (characters spoken per second), not a decorative random wave.
 */
export function speechWaveform(ep, bars = 64) {
  const segs = ep?.transcript?.segments || ep?.paragraphs || [];
  const total = ep?.durationSeconds || (segs.length ? segs[segs.length - 1].start + 5 : 0);
  if (!segs.length || !total) return Array(bars).fill(0.12);
  const slice = total / bars;
  const out = new Array(bars).fill(0);
  segs.forEach((s, i) => {
    const end = Math.min(segs[i + 1]?.start ?? total, total);
    const len = Math.max(0.5, end - s.start);
    const rate = (s.text || '').length / len; // chars per second over this segment
    // Spread the segment's rate across every slice it overlaps.
    for (let b = Math.floor(s.start / slice); b < bars && b * slice < end; b++) {
      const overlap = Math.min(end, (b + 1) * slice) - Math.max(s.start, b * slice);
      if (overlap > 0) out[b] += rate * (overlap / slice);
    }
  });
  // Light smoothing, then stretch to a readable range.
  // The floor is a low percentile, not the minimum, so quiet stretches read as quiet.
  const smooth = out.map((v, i) => (out[i - 1] ?? v) * 0.2 + v * 0.6 + (out[i + 1] ?? v) * 0.2);
  const sorted = [...smooth].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.1)];
  const hi = sorted[sorted.length - 1];
  return smooth.map((v) => {
    const t = hi > lo ? Math.max(0, (v - lo) / (hi - lo)) : 0.5;
    return +(0.12 + 0.88 * Math.pow(t, 1.4)).toFixed(3);
  });
}
