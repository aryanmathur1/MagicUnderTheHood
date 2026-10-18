// Build-time translation of the readable transcript paragraphs into the
// languages listed in config/site.js. Translations are committed as static JSON
// and swapped client-side, so the live site stays fast and makes no runtime AI
// call for translation.
//
// We use a marker-based format ("[[N]] text") instead of a JSON array so that
// alignment is guaranteed by the paragraph NUMBER, not by the model returning an
// exactly-sized array (which it does not do reliably for longer transcripts).
// Any paragraph the model drops simply falls back to English; the array is
// always the right length and never shifts.
import { generate, noEmDash } from './gemini.js';
import { models, languages } from '../../config/site.js';

function parseMarked(raw, n) {
  const out = new Array(n).fill(null);
  const re = /\[\[(\d+)\]\]\s*([\s\S]*?)(?=\n?\[\[\d+\]\]|$)/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const idx = Number(m[1]);
    const text = m[2].trim();
    if (idx >= 0 && idx < n && text) out[idx] = text;
  }
  return out;
}

/**
 * Translate an array of paragraph texts into one language.
 * Always returns a same-length array (gaps filled with the English original), or
 * null only if the model returned nothing usable.
 */
export async function translateOne(texts, lang, tries = 2) {
  const n = texts.length;
  const numbered = texts.map((t, i) => `[[${i}]] ${t}`).join('\n\n');
  const prompt = `Translate the following ${n} numbered transcript paragraphs into ${lang.name}. This is a spoken transcript from a student robotics podcast.
Rules:
- Keep every "[[N]]" marker EXACTLY as-is at the start of its paragraph. Do not translate, renumber, or remove the markers.
- Translate only the text after each marker. Keep exactly ${n} paragraphs. Do not merge or split them.
- Keep team numbers and product names (e.g. "Limelight", "goBILDA", "April tag") as-is.
- Never use em dashes. Use commas, colons, or separate sentences instead.
- Output only the paragraphs in "[[N]] translated text" form, one blank line between them, nothing else.

${numbered}`;

  let best = null;
  let bestCount = -1;
  for (let i = 0; i < tries; i++) {
    const raw = await generate(prompt, { temperature: 0.2, model: models.translate, maxOutputTokens: 8192 });
    const map = parseMarked(raw, n);
    const count = map.filter(Boolean).length;
    if (count > bestCount) {
      best = map;
      bestCount = count;
    }
    if (count === n) break;
  }
  if (!best || bestCount === 0) return null;
  const cjk = lang.code === 'zh';
  return best.map((t, i) => noEmDash(t == null ? texts[i] : t, { cjk }));
}

/**
 * Translate the paragraph list into every configured language.
 * @returns {Object} { es: [strings...], fr: [...], ... } keyed by language code.
 */
export async function translateParagraphs(paragraphs, log = () => {}) {
  const texts = paragraphs.map((p) => p.text);
  const result = {};
  for (const lang of languages) {
    try {
      const arr = await translateOne(texts, lang);
      if (arr) {
        const gaps = arr.filter((t, i) => t === texts[i]).length;
        result[lang.code] = arr;
        log(`translated → ${lang.name}${gaps ? ` (${gaps} paragraph(s) left in English)` : ''}`);
      } else {
        log(`⚠︎ ${lang.name}: no usable translation, omitted`);
      }
    } catch (err) {
      log(`⚠︎ skipped ${lang.name}: ${err.message}`);
    }
  }
  return result;
}
