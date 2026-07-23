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
 * Each paragraph links to its start time on YouTube.
 */
export function paragraphs(segments, targetWords = 80) {
  const out = [];
  let buf = null;
  for (const seg of segments) {
    if (!buf) buf = { start: seg.start, text: seg.text };
    else if (countWords(buf.text) < targetWords)
      buf.text = `${buf.text} ${seg.text}`.replace(/\s+/g, ' ').trim();
    else {
      out.push(buf);
      buf = { start: seg.start, text: seg.text };
    }
  }
  if (buf) out.push(buf);
  return out;
}

function countWords(s) {
  return s.split(/\s+/).filter(Boolean).length;
}
function round(n) {
  return Math.round(n * 100) / 100;
}
