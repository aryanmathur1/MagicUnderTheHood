// Parse YouTube caption formats into a clean array of timed segments:
//   [{ start: <seconds>, text: "..." }, ...]
// json3 is YouTube's native timed format; it is the most reliable source of
// per-line start times.

/** Parse a json3 caption string into timed segments. */
export function parseJson3(json3String) {
  const data = JSON.parse(json3String);
  const events = data.events || [];
  const segments = [];
  for (const ev of events) {
    if (!ev.segs) continue;
    const text = ev.segs
      .map((s) => s.utf8 || '')
      .join('')
      .replace(/>>+/g, ' ') // YouTube speaker-change markers
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    const start = (ev.tStartMs ?? 0) / 1000;
    segments.push({ start: round(start), text });
  }
  return mergeTiny(segments);
}

// Auto-captions often arrive as many one-or-two-word fragments. Merge adjacent
// fragments into readable lines (~a sentence worth) while keeping the start time
// of the first fragment in each merged line.
function mergeTiny(segments, targetChars = 90) {
  const out = [];
  let buf = null;
  for (const seg of segments) {
    if (!buf) {
      buf = { start: seg.start, text: seg.text };
      continue;
    }
    if (buf.text.length < targetChars) {
      buf.text = `${buf.text} ${seg.text}`.replace(/\s+/g, ' ').trim();
    } else {
      out.push(buf);
      buf = { start: seg.start, text: seg.text };
    }
  }
  if (buf) out.push(buf);
  return out;
}

function round(n) {
  return Math.round(n * 100) / 100;
}

/** Format seconds as H:MM:SS or M:SS for display. */
export function formatTimestamp(totalSeconds) {
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor((totalSeconds / 60) % 60);
  const h = Math.floor(totalSeconds / 3600);
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
