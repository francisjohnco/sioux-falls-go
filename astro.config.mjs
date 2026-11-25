// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import fs from 'node:fs';
import path from 'node:path';

// Real "last modified" dates for the sitemap, the way WordPress/Yoast does it.
// Google uses lastmod to decide what to recrawl, so each article reports its
// own updatedAt instead of every page claiming it changed on every build.
function articleDates() {
  const dir = path.resolve('src/content/articles');
  const dates = new Map();
  if (!fs.existsSync(dir)) return dates;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    const head = fs.readFileSync(path.join(dir, f), 'utf-8').slice(0, 4000);
    const m = head.match(/^updatedAt:\s*(\d{4}-\d{2}-\d{2})/m) || head.match(/^publishedAt:\s*(\d{4}-\d{2}-\d{2})/m);
    if (m) dates.set(f.replace(/\.md$/, ''), m[1]);
  }
  return dates;
}
const ARTICLE_DATES = articleDates();
const BUILD_DATE = new Date().toISOString().slice(0, 10);

export default defineConfig({
  site: 'https://siouxfallsgo.com',
  integrations: [
    sitemap({
      filter: (page) =>
        !page.includes('/admin') && !page.includes('/login') && !page.includes('/host-dashboard') &&
        !page.includes('/host-login') && !page.includes('/business-login') && !page.includes('/my-business') &&
        !/\/marketing-tips-insights\/?$/.test(page),
      serialize(item) {
        const m = item.url.match(/\/guides\/([^/]+)\/?$/);
        // Articles: their real update date. Hub pages (home, categories,
        // events, deals) really do change daily, so they get the build date.
        item.lastmod = m && ARTICLE_DATES.has(m[1]) ? ARTICLE_DATES.get(m[1]) : BUILD_DATE;
        return item;
      },
    }),
  ],
});
