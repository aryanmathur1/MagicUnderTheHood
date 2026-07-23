# How this site works — a plain-English tour

_Written for judges and teammates who don't code. No jargon required._

## The problem we set out to solve

Our team runs an interview podcast where other FTC teams share genuinely useful advice. But
that advice was **trapped inside videos**. You can't skim a video, you can't search it, and
Google can't read what's said out loud. So great answers — "how did you handle sorting this
season?" — were effectively invisible.

This site fixes that. It turns every episode into something you can **read, search, and jump
around in**, and it can **answer a question** by finding the moment a team actually talked
about it.

---

## The one big idea: do the hard work early

There are two kinds of work a website like this could do:

- **Heavy work:** listening to each episode, writing a transcript, summarizing it, picking
  highlights, and building a "search brain."
- **Light work:** showing a page, and answering a single question a visitor types.

We do **all the heavy work ahead of time**, on our own computer, and save the results as
plain files. When a visitor shows up, the website just serves those ready-made files. This
is why the site is **fast** and **costs almost nothing to run** — the expensive thinking
already happened once, not every time someone visits.

```
   OUR COMPUTER (once, ahead of time)          THE LIVE WEBSITE (every visitor)
   ───────────────────────────────────         ────────────────────────────────
   ▶ read each YouTube video's details          • show pre-made pages instantly
   ▶ get a timestamped transcript               • let people read transcripts
   ▶ write summaries, chapters, quotes          • let people watch/jump to moments
   ▶ pick shareable clips                       • answer ONE typed question live
   ▶ build a "search index"                       (the only live thinking)
        │
        └── all saved as plain files ──────────▶ the website reads these files
```

We call the heavy step the **pipeline**. Running it is one command: `npm run regenerate`.
To add a new episode, we paste its YouTube link into a single list and run that command
again. Everything rebuilds itself.

---

## What the pipeline produces, step by step

For each episode, the pipeline creates:

1. **Real episode details** — the actual title, description, and length, pulled straight
   from YouTube. We never make these up.
2. **A timestamped transcript** — the full text of what's said, with the time of each line.
   We use YouTube's own captions when they exist; if a video has none, the computer listens
   to the audio and writes the transcript itself.
3. **Show notes** — a short summary, chapter markers (like "3:12 Autonomous strategy"), and
   3–4 memorable pull quotes. It even formats the chapters so we can paste them straight
   into a YouTube description.
4. **Shareable clips** — the 3–4 best 20–60 second moments, each with a ready-to-post
   caption for Instagram Reels or YouTube Shorts.
5. **A search index** — this is the "search brain." Every part of every transcript is turned
   into a list of numbers that captures its **meaning**. That's what lets someone search by
   idea ("sorting game pieces") instead of exact words.

All of this is saved as files and shipped with the site.

---

## "Ask the Podcast" — the only live step

This is the one place the website thinks in real time. Here's what happens when someone
types a question:

1. The question is turned into the same kind of "meaning numbers" as the transcripts.
2. The site compares the question to every part of every episode and finds the closest
   matches — the moments most likely to contain the answer.
3. Those matching transcript pieces (and **only** those) are handed to Google's Gemini AI,
   which writes a short, clear answer.
4. The answer comes back with its **sources**: which episode, what timestamp, and a link
   that jumps to that exact second on YouTube — plus the supporting quote.

So the answer isn't the AI's opinion or outside knowledge — it's a summary of **what teams
actually said on our podcast**, with receipts.

---

## The key-proxy decision (keeping our API key safe)

To talk to Google's AI, we use a secret **API key**. If we put that key in the website's
code, anyone could open the page, copy it, and run up charges on our account. That would be
a serious mistake.

So we don't. The key is stored in a **locked back room** — a tiny secure service (a
"serverless function") that runs on Vercel's servers, not in the visitor's browser. When
someone asks a question:

```
   Visitor's browser  ──►  our small secure service  ──►  Google Gemini
   (never sees the key)     (holds the key privately)      (does the AI work)
```

The browser only ever talks to **our** service, and only our service knows the key. We also
added two safety valves to that service:

- **A length cap** — questions over 500 characters are rejected, so no one can paste huge
  inputs to waste resources.
- **Rate limiting** — if someone fires off too many questions too quickly, they're asked to
  slow down.

---

## The guardrails (the part we care about most)

We were careful not to build something that makes things up or misquotes the teams we
interview. These rules are enforced by the search service on every single answer:

- **Answers come only from our transcripts.** The AI is given the relevant transcript
  pieces and told to use nothing else. If the archive doesn't cover a question, the site
  **says so plainly** — "The archive doesn't cover that yet" — instead of guessing.
- **Every answer shows its sources.** You always get the episode name and a timestamp link,
  so you can watch it yourself and confirm we got it right.
- **We never put words in a team's mouth.** Quotes are copied exactly from the transcript;
  the service even double-checks that a quote really appears before showing it. Anything
  that isn't a direct quote is clearly a paraphrase.
- **It's built for students.** Everything is kept appropriate for a middle- and high-school
  audience.

Because the timestamps and episode names are built from our own saved data (not written by
the AI), the "sources" can't be faked — they always point to a real moment you can check.

---

## Why this is cheap and sturdy

- The pages are **pre-built files**, so serving them is basically free and very fast.
- The search index is a **plain file** we ship with the site — no expensive database.
- The only running cost is the occasional question, answered on Google's **free tier**.
- Adding an episode is one command; nothing about the live site has to be hand-edited.

That's the whole system: do the hard work once, keep the key in a locked room, and never
say anything the podcast didn't actually say.
