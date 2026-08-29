// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // TODO: set the real production domain before launch — sitemap, canonical
  // URLs, and OG tags in BaseLayout.astro all depend on this being correct.
  site: 'https://siouxfallsgo.com',
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/admin') && !page.includes('/login') && !page.includes('/host-dashboard') && !page.includes('/host-login'),
    }),
  ],
});
