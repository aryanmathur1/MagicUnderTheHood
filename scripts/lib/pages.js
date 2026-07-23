// Fetch a web page (your own team site) and extract its readable text so it can
// be folded into the searchable archive alongside the podcast transcripts.
// Deliberately dependency-free: a small HTML-to-text pass is plenty for the
// simple static pages on metalmagicftc.org.

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  '#39': "'", '#34': '"', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
};

function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code) => {
    if (ENTITIES[code]) return ENTITIES[code];
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return m;
  });
}

/** @returns {Promise<{title:string,text:string}>} */
export async function fetchPageText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 MagicUnderTheHood-bot' } });
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  const html = await res.text();
  const pageTitle = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || url).trim();

  let body = html.match(/<body[\s\S]*?<\/body>/i)?.[0] || html;
  body = body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(nav|header|footer|noscript)[\s\S]*?<\/\1>/gi, ' ')
    // keep block boundaries as spaces so words don't run together
    .replace(/<\/(p|div|li|h[1-6]|br|section|tr)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  const text = decodeEntities(body).replace(/\s+/g, ' ').trim();
  return { title: decodeEntities(pageTitle), text };
}
