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
