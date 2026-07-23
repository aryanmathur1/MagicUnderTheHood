import { defineConfig } from 'astro/config';
import { site } from './config/site.js';

// Fully static output. Every page is pre-rendered HTML at build time — fast,
// cheap, SEO-friendly. The only server code is api/ask.js, which Vercel picks
// up automatically from the /api directory (it is NOT part of the Astro build).
export default defineConfig({
  site: site.baseUrl,
  output: 'static',
  build: {
    format: 'directory',
  },
  devToolbar: { enabled: false },
});
