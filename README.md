# Magic Under the Hood — Searchable Podcast Archive

A fast, accessible, searchable website for **Metal Magic FTC Team #23362**'s interview
podcast. Every episode gets a full timestamped transcript, auto-generated show notes and
clips, and an **"Ask the Podcast"** semantic search that answers questions in plain English
and links to the exact moment on YouTube.

- **Live site:** _(add your Vercel URL here after deploying — see [Deploy](#deploy))_
- **How it works, for non-programmers:** [ARCHITECTURE.md](./ARCHITECTURE.md)

The guiding idea: **all the heavy work happens once, ahead of time, and is saved as plain
files.** The live site is just static pages plus one tiny search service, so it's fast and
essentially free to run.

---

## Table of contents

1. [What you need](#what-you-need)
2. [First-time setup](#first-time-setup)
3. [Add or update episodes (the regenerate script)](#add-or-update-episodes)
4. [Run it locally](#run-it-locally)
5. [Deploy](#deploy)
6. [Point a subdomain at it](#point-a-subdomain-at-it)
7. [Project structure](#project-structure)
8. [Troubleshooting](#troubleshooting)

---

## What you need

| Thing | Why | How to get it |
|---|---|---|
| **Node.js 18+** | Runs the site and the build script | <https://nodejs.org> |
| **yt-dlp** | Downloads YouTube metadata + captions | `brew install yt-dlp` (Mac) / [docs](https://github.com/yt-dlp/yt-dlp#installation) |
| **ffmpeg** | Needed only for the audio-transcription fallback | `brew install ffmpeg` |
| **A free Gemini API key** | Transcription fallback, show notes, clips, search | <https://aistudio.google.com/apikey> |

The Gemini key is on Google's **free tier** — no credit card needed for the volume this
site uses.

---

## First-time setup

```bash
# 1. Install dependencies
npm install

# 2. Add your API key
cp .env.example .env
#    then open .env and paste your key after GEMINI_API_KEY=
```

Your key lives in **two** places (both private, never in browser code):

1. **`.env`** on your computer — so the build script can generate everything.
2. **Vercel → Project → Settings → Environment Variables** — so the live search works
   (you'll add this during [Deploy](#deploy)).

---

## Add or update episodes

**This is the only file you edit to add an episode:** [`config/episodes.json`](./config/episodes.json).

1. Find the video's YouTube id — it's the part after `watch?v=`.
   For `https://www.youtube.com/watch?v=vDX-ht7H9Fw`, the id is `vDX-ht7H9Fw`.
2. Add it to the list:

   ```json
   {
     "episodes": [
       { "id": "vDX-ht7H9Fw" },
       { "id": "EK5vX8DDwtE" },
       { "id": "addp3fU6f_4" },
       { "id": "YOUR_NEW_VIDEO_ID" }
     ]
   }
   ```

3. Regenerate everything:

   ```bash
   npm run regenerate
   ```

That one command pulls the **real** title, description, and duration, gets a **timestamped
transcript** (YouTube captions first; if a video has none, it downloads the audio and
transcribes it with Gemini), writes **show notes** (summary, chapters, pull quotes, plus a
copy-paste chapter block for the YouTube description), picks **shareable clips**, and
rebuilds the **search index**. Results are saved as JSON in `src/data/` and
`api/embeddings.json` — commit those files.

### Adding your own web pages to the search

"Ask the Podcast" can also answer from pages on your team site (e.g. a robot-design
writeup). Add them to [`config/pages.json`](./config/pages.json):

```json
{ "pages": [ { "url": "https://metalmagicftc.org/robot-design.html", "title": "Robot & Design" } ] }
```

Run `npm run regenerate` and the page's text is fetched, chunked, embedded, and cited in
answers with a 🔗 link back to the page (episodes are cited with a ▶ timestamp). Only add
pages you own or are allowed to index.

### Transcript translations

Each transcript is pre-translated at build time into the languages listed in
`config/site.js` (`languages`). On an episode page, a 🌐 **Language** dropdown swaps the
transcript instantly — no runtime AI call, it's all static. You can also deep-link a
translated view, e.g. `/episodes/vDX-ht7H9Fw/?lang=es`. Add or remove languages in
`config/site.js` and re-run `npm run regenerate`; translations are cached and only redone
when the transcript changes (or with `--force`).

### Handy variations

```bash
npm run regenerate                     # rebuild everything
npm run regenerate -- --episode ID     # just one episode
npm run regenerate -- --force          # ignore caches, redo the AI steps
```

> **No key yet?** The script still runs the free steps (metadata + captions). It skips the
> AI steps (show notes, clips, search index) with a warning, and the site renders fine
> without them — they fill in the next time you run it with a key.

---

## Run it locally

**Just the pages** (fast, no search backend):

```bash
npm run dev        # http://localhost:4321
```

**The whole thing including the "Ask" search** needs the serverless function, which the
Vercel CLI runs locally:

```bash
npm i -g vercel
vercel dev         # runs pages + /api/ask together, loads .env automatically
```

---

## Deploy

The site is built for **Vercel** (static pages **+** one serverless function for search).
GitHub Pages can't host the search function, which is why we use Vercel.

**Option A — from your computer (quickest):**

```bash
npm i -g vercel
vercel            # first run: log in, link/create a project, accept defaults
vercel --prod     # publish to your public URL
```

**Option B — from GitHub (auto-deploy on every push):**

1. Push this folder to a GitHub repo.
2. On <https://vercel.com>, **Add New → Project**, import the repo. Vercel auto-detects
   Astro; keep the defaults.
3. Deploy.

**Then, for search to work, add the key on Vercel** (either option):
**Project → Settings → Environment Variables → Add**, name `GEMINI_API_KEY`, paste your
key, save, and redeploy. That's it — the key stays encrypted on Vercel and is only read by
the search function.

Finally, put your live URL at the top of this README.

---

## Point a subdomain at it

To serve the site at something like `podcast.metalmagicftc.org`:

1. In Vercel: **Project → Settings → Domains → Add**, and enter your subdomain.
2. Vercel shows you a DNS record to create. In your domain registrar's DNS settings, add a
   **CNAME** record:
   - **Name/Host:** `podcast` (the subdomain part)
   - **Value/Target:** `cname.vercel-dns.com` (Vercel shows the exact value)
3. Save. DNS can take a few minutes to a few hours. Vercel issues the HTTPS certificate
   automatically.
4. Update `baseUrl` in [`config/site.js`](./config/site.js) to your final URL so page
   metadata and links are correct, then redeploy.

---

## Project structure

```
config/
  episodes.json     ← THE file you edit to add episodes
  site.js           ← branding, Gemini model names, limits (safe to tweak)
scripts/
  regenerate.js     ← the offline build pipeline (npm run regenerate)
  lib/              ← yt-dlp, captions, chunking, Gemini, enrichment helpers
src/
  data/             ← generated per-episode JSON + manifest (committed)
  pages/            ← Home, Episodes, Episode detail, About
  components/       ← AskPodcast, EpisodeCard
  layouts/Base.astro
api/
  ask.js            ← the ONLY backend: the search proxy that hides the key
  embeddings.json   ← generated search index (used only by the function)
ARCHITECTURE.md     ← plain-English explanation of the whole system
```

---

## Troubleshooting

- **`GEMINI_API_KEY is not set`** — you skipped `.env`, or you're running `node` directly.
  Use `npm run regenerate` (it loads `.env`), or export the key in your shell.
- **A model name stopped working** — Google occasionally retires free models. Update the
  names in `config/site.js` and re-run. To list what your key can use:
  `node --env-file=.env -e 'fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`).then(r=>r.json()).then(d=>console.log(d.models.map(m=>m.name).join("\n")))'`
- **`429 quota exceeded` on search** — the runtime model (`models.chat`) has a free daily
  cap. We use `gemini-flash-lite-latest` because Flash-Lite has the most generous free tier
  (full `-flash` models can be as low as ~20 requests/day, which a live site would burn
  through fast). Build-time enrichment uses a higher-quality model (`models.enrich`), which
  is fine because it only runs when you add episodes. If search gets throttled, either wait
  for the daily reset or point `models.chat` at another available model.
- **`yt-dlp: command not found`** — install it (`brew install yt-dlp`) or set `YTDLP_PATH`
  to its full path.
- **Search says "isn't set up yet"** — the index (`api/embeddings.json`) is empty. Run
  `npm run regenerate` with a key, commit the file, and redeploy.
- **A video has no captions** — the script falls back to Gemini audio transcription
  (needs `ffmpeg` + a key). This is slower but automatic.
