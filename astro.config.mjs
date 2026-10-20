// @ts-check
import { defineConfig } from 'astro/config';

// SITE_URL is optional; set it (e.g. as a GitHub Actions variable) once the
// final domain is known so canonical and Open Graph URLs are absolute.
export default defineConfig({
  site: process.env.SITE_URL || 'https://farmington-hb1300.pages.dev',
  output: 'static',
  build: {
    inlineStylesheets: 'always',
  },
  compressHTML: true,
});
