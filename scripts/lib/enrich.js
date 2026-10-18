// Build-time AI enrichment: show notes (summary, chapters, pull quotes,
// copy-paste YouTube chapter block) and shareable clip suggestions.
// All prompts enforce the project guardrails: only use what's in the transcript,
// paraphrase clearly, never invent quotes, keep it student-appropriate.
import { generate, noEmDash } from './gemini.js';
import { formatTimestamp } from './captions.js';

// Collapse whitespace + lowercase for verbatim substring checks (captions have
// irregular spacing; we do not otherwise alter the text).
function norm(s) {
  return String(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

// Compact the transcript into "MM:SS text" lines so the model can cite real
// timestamps without us shipping the entire token-heavy segment list.
function timedTranscript(segments) {
  return segments.map((s) => `[${formatTimestamp(s.start)}] ${s.text}`).join('\n');
}

// Turn "M:SS" / "H:MM:SS" back into integer seconds for building links.
export function toSeconds(ts) {
  const parts = String(ts).split(':').map(Number);
  if (parts.some(Number.isNaN)) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

const GUARD =
  'Only use information actually present in the transcript. Never invent facts, ' +
  'names, or quotes. When you quote a guest, copy their words exactly; otherwise ' +
  'paraphrase and make it clear it is a paraphrase. Keep everything appropriate ' +
  'for a middle/high-school student audience. Never use em dashes; use commas, ' +
  'colons, or separate sentences instead.';

export async function makeShowNotes(meta, segments) {
  const transcript = timedTranscript(segments);
  const prompt = `You are writing show notes for an FTC robotics interview podcast episode.

Episode title: ${meta.title}

Transcript (each line is "[timestamp] text"):
${transcript}

${GUARD}

Return JSON with this exact shape:
{
  "summary": "2-4 sentence plain-English summary of what this episode covers.",
  "chapters": [ { "time": "M:SS", "title": "Short chapter title" } ],
  "pullQuotes": [ { "time": "M:SS", "quote": "A verbatim, quotable line from the transcript (<=200 chars)." } ]
}

Rules:
- 4 to 8 chapters, in chronological order, first one at 0:00. Titles are 2-6 words.
- Use timestamps that actually appear in the transcript.
- Provide 5 to 6 pull quote candidates. Each "quote" MUST be copied character-for-character from the transcript text (an exact substring). Do NOT fix grammar, spelling, or caption errors. Pick genuinely insightful or memorable lines.`;

  const data = await generate(prompt, { json: true, temperature: 0.4 });

  // Guardrail: keep ONLY pull quotes that appear verbatim in the transcript, so
  // we never present a cleaned-up or invented line as a direct quote. We compare
  // with whitespace collapsed (captions have odd spacing) but no other edits.
  const haystack = norm(segments.map((s) => s.text).join(' '));
  const verbatim = (data.pullQuotes || []).filter((q) => q?.quote && haystack.includes(norm(q.quote)));
  data.pullQuotes = verbatim.slice(0, 4);

  // Build the copy-pasteable YouTube-description chapter block.
  const chapterBlock = (data.chapters || [])
    .map((c) => `${c.time} ${c.title}`)
    .join('\n');

  return {
    summary: noEmDash(data.summary || ''),
    chapters: (data.chapters || []).map((c) => ({
      time: c.time,
      seconds: toSeconds(c.time),
      title: noEmDash(c.title),
    })),
    pullQuotes: (data.pullQuotes || []).map((q) => ({
      time: q.time,
      seconds: toSeconds(q.time),
      quote: q.quote,
    })),
    youtubeChapterBlock: noEmDash(chapterBlock),
  };
}

export async function makeClips(meta, segments) {
  const transcript = timedTranscript(segments);
  const prompt = `You are a social-media editor for an FTC robotics interview podcast, finding the most shareable moments for Instagram Reels / YouTube Shorts.

Episode title: ${meta.title}

Transcript (each line is "[timestamp] text"):
${transcript}

${GUARD}

Return JSON: an array of 3 to 4 objects, each:
{
  "start": "M:SS",   // where the clip should start (must appear in transcript)
  "end": "M:SS",     // 20-60 seconds after start
  "reason": "One sentence: why this moment is shareable.",
  "caption": "A ready-to-post caption (<=150 chars). May use 1-2 relevant hashtags like #FTC #FIRSTrobotics. Do not put invented words in a guest's mouth."
}
Pick self-contained moments with a clear insight, funny line, or strong advice.`;

  const arr = await generate(prompt, { json: true, temperature: 0.5 });
  return (Array.isArray(arr) ? arr : []).map((c) => ({
    start: c.start,
    startSeconds: toSeconds(c.start),
    end: c.end,
    endSeconds: toSeconds(c.end),
    reason: noEmDash(c.reason),
    caption: noEmDash(c.caption),
  }));
}
