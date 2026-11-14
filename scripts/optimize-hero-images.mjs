// Builds small, fast versions of every local article header image before the
// site is built. Each source becomes 16:9 WebP files at 480, 960, and 1600
// pixels wide plus a 1200x630 JPG for link previews (Facebook, iMessage,
// Google Discover). Results are cached in node_modules/.cache, which Netlify
// keeps between builds, so only new or changed images are processed.
//
// Photos chosen from Unsplash or Pexels are not touched here: those services
// resize and convert them on their own CDN, and Unsplash requires that its
// photos are shown from its servers.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(PUBLIC, 'images', 'opt');
const CACHE = path.join(ROOT, 'node_modules', '.cache', 'sfg-hero');
const MANIFEST = path.join(ROOT, 'src', 'generated', 'hero-manifest.json');
const WIDTHS = [480, 960, 1600];

// Safety net images (see src/lib/hero.ts). Always optimized so a fallback is
// never a heavy file either.
const FALLBACKS = [
  '/images/scenic/falls-park-golden.jpg', '/images/scenic/mckennan-park.jpg', '/images/scenic/downtown-2.jpg',
  '/images/stock/restaurant-workers.jpg', '/images/stock/real-estate-keys.jpg', '/images/stock/shop-local-chalkboard.jpg',
  '/images/stock/lawn-mower.jpg',
];

function articleImages() {
  const dir = path.join(ROOT, 'src', 'content', 'articles');
  const out = new Set(FALLBACKS);
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    const m = fs.readFileSync(path.join(dir, f), 'utf8').match(/^heroImage:\s*"?([^"\n]+)"?\s*$/m);
    if (m && m[1].startsWith('/')) out.add(m[1].trim());
  }
  return [...out];
}

const nameFor = (src) => src.replace(/^\/images\//, '').replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });

const manifest = {};
let made = 0, reused = 0, missing = 0;
const started = Date.now();

for (const src of articleImages()) {
  const file = path.join(PUBLIC, src);
  if (!fs.existsSync(file)) { missing++; console.warn(`  hero image missing on disk: ${src}`); continue; }
  const buf = fs.readFileSync(file);
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10);
  const base = `${nameFor(src)}-${hash}`;
  const outputs = [...WIDTHS.map((w) => `${base}-${w}.webp`), `${base}-og.jpg`];

  if (!outputs.every((o) => fs.existsSync(path.join(CACHE, o)))) {
    // attention picks the most interesting part of the photo when cropping to 16:9
    for (const w of WIDTHS) {
      await sharp(buf).resize(w, Math.round((w * 9) / 16), { fit: 'cover', position: sharp.strategy.attention, withoutEnlargement: false })
        .webp({ quality: w >= 1600 ? 72 : 76, effort: 5 }).toFile(path.join(CACHE, `${base}-${w}.webp`));
    }
    await sharp(buf).resize(1200, 630, { fit: 'cover', position: sharp.strategy.attention })
      .jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(CACHE, `${base}-og.jpg`));
    made++;
  } else reused++;

  for (const o of outputs) fs.copyFileSync(path.join(CACHE, o), path.join(OUT, o));
  manifest[src] = {
    srcset: WIDTHS.map((w) => `/images/opt/${base}-${w}.webp ${w}w`).join(', '),
    src: `/images/opt/${base}-960.webp`,
    card: `/images/opt/${base}-480.webp`,
    large: `/images/opt/${base}-1600.webp`,
    og: `/images/opt/${base}-og.jpg`,
  };
}

fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
// Public copy so the photo finder can show Claude a light version of an article's current image.
fs.writeFileSync(path.join(PUBLIC, 'hero-manifest.json'), JSON.stringify(manifest));
console.log(`hero images: ${made} optimized, ${reused} from cache, ${missing} missing (${((Date.now() - started) / 1000).toFixed(1)}s)`);
