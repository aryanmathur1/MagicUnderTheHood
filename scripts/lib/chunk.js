// Turn a list of timed transcript segments into larger, overlapping chunks that
// are good units for semantic search. Each chunk keeps the START TIME of its
// first segment so every search hit can link to the exact YouTube moment.
import { rag } from '../../config/site.js';

/**
 * @param {{start:number,text:string}[]} segments
 * @returns {{start:number,text:string}[]} chunks (~rag.chunkWords words each)
 */
export function chunkSegments(segments) {
  const chunks = [];
  let i = 0;
  while (i < segments.length) {
    let words = 0;
    let j = i;
    const start = segments[i].start;
    const parts = [];
    while (j < segments.length && words < rag.chunkWords) {
      parts.push(segments[j].text);
      words += countWords(segments[j].text);
      j++;
    }
    chunks.push({ start: round(start), text: parts.join(' ').replace(/\s+/g, ' ').trim() });
    if (j >= segments.length) break;
    // Step back by the overlap so chunks share context at their seams.
    let back = 0;
    let k = j;
    while (k > i && back < rag.chunkOverlapWords) {
      k--;
      back += countWords(segments[k].text);
    }
    i = Math.max(k, i + 1);
  }
  return chunks;
}

/**
 * Group timed segments into readable paragraphs for the on-page transcript.
 * Paragraph boundaries always fall on SENTENCE boundaries (never mid-sentence),
 * and each paragraph links to the start time of its first sentence on YouTube.
 */
export function paragraphs(segments, targetWords = 65) {
  const sentences = toSentences(segments);
  const out = [];
  let buf = null;
  let words = 0;
  for (const s of sentences) {
    if (!buf) {
      buf = { start: s.start, text: s.text };
      words = countWords(s.text);
    } else if (words < targetWords) {
      buf.text = `${buf.text} ${s.text}`.replace(/\s+/g, ' ').trim();
      words += countWords(s.text);
    } else {
      out.push(buf);
      buf = { start: s.start, text: s.text };
      words = countWords(s.text);
    }
  }
  if (buf) out.push(buf);
  return out;
}

/**
 * Re-cut timed caption segments into whole sentences. Each sentence keeps the
 * start time of the caption segment where it begins, so links stay accurate even
 * though sentences cross the original caption-line boundaries.
 */
export function toSentences(segments) {
  // Build one continuous string, remembering where each segment starts so we can
  // map a sentence's character offset back to a timestamp.
  let combined = '';
  const marks = []; // { offset, start }
  segments.forEach((seg, i) => {
    if (i > 0) combined += ' ';
    marks.push({ offset: combined.length, start: seg.start });
    combined += seg.text;
  });

  // Split after sentence-ending punctuation followed by whitespace.
  const parts = combined.split(/(?<=[.?!])\s+/);
  const sentences = [];
  let cursor = 0;
  for (const part of parts) {
    const text = part.trim();
    if (!text) continue;
    const offset = combined.indexOf(part, cursor);
    cursor = offset + part.length;
    let start = marks[0]?.start ?? 0;
    for (const mk of marks) {
      if (mk.offset <= offset) start = mk.start;
      else break;
    }
    sentences.push({ start: round(start), text });
  }
  return sentences;
}

function countWords(s) {
  return s.split(/\s+/).filter(Boolean).length;
}
function round(n) {
  return Math.round(n * 100) / 100;
}
