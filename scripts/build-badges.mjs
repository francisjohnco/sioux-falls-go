// Builds the website badge for every Community Champion: the seal, their
// name, and their Google star rating, as a PNG at /badges/<slug>.png.
// Owners paste a small piece of HTML (from their dashboard) that shows this
// image and links to their Sioux Falls Go profile. Because the image is
// rebuilt on every deploy, the stars update on their website by themselves
// after each weekly review sync.
//
// Text is drawn as vector shapes from the Poppins font files, so the badge
// looks the same no matter what fonts the build server has.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import opentype from 'opentype.js';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'public', 'badges');
const CACHE = path.join(ROOT, 'node_modules', '.cache', 'sfg-badges');
const FONT_DIR = path.join(ROOT, 'node_modules', '@fontsource', 'poppins', 'files');
const VERSION = 'v1';
const S = 2; // drawn at 2x for sharp screens; shown at 360x120

const font = (w) => opentype.parse(fs.readFileSync(path.join(FONT_DIR, `poppins-latin-${w}-normal.woff`)).buffer.slice(0));
const F = { 500: font(500), 600: font(600), 700: font(700), 800: font(800) };

const NAVY = '#1B2A4A', ORANGE = '#E8711A', GOLD = '#F5B429', GRAY = '#6B7A90', LINE = '#E3E8EF';

function text(str, weight, size, x, y, fill, { spacing = 0, maxWidth } = {}) {
  const f = F[weight];
  let s = size;
  const width = (sz) => f.getAdvanceWidth(str, sz) + spacing * sz * (str.length - 1);
  if (maxWidth) while (width(s) > maxWidth && s > size * 0.6) s -= 0.5;
  let d = '';
  if (spacing) {
    let cx = x;
    for (const ch of str) { d += f.getPath(ch, cx, y, s).toPathData(2); cx += f.getAdvanceWidth(ch, s) + spacing * s; }
  } else d = f.getPath(str, x, y, s).toPathData(2);
  return { svg: `<path d="${d}" fill="${fill}"/>`, width: width(s), size: s };
}

function star(cx, cy, r, fill, clipWidth) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  const id = `c${Math.round(cx)}`;
  const base = `<polygon points="${pts.join(' ')}" fill="#E6E9EF"/>`;
  if (clipWidth <= 0) return base;
  return `${base}<clipPath id="${id}"><rect x="${cx - r}" y="${cy - r}" width="${clipWidth}" height="${2 * r}"/></clipPath><polygon points="${pts.join(' ')}" fill="${fill}" clip-path="url(#${id})"/>`;
}

function badgeSvg(name, rating, reviews) {
  const W = 360 * S, H = 120 * S, sealSize = 96 * S, pad = 12 * S, tx = pad + sealSize + 14 * S, maxW = W - tx - 16 * S;
  const parts = [];
  parts.push(`<rect x="${S}" y="${S}" width="${W - 2 * S}" height="${H - 2 * S}" rx="${16 * S}" fill="#fff" stroke="${LINE}" stroke-width="${2 * S}"/>`);
  parts.push(`<rect x="${tx - 6 * S}" y="${24 * S}" width="${3 * S}" height="${H - 48 * S}" rx="${1.5 * S}" fill="${LINE}"/>`);
  const label = text('COMMUNITY CHAMPION', 700, 10.5 * S, tx, 32 * S, ORANGE, { spacing: 0.08 });
  const biz = text(name, 700, 17 * S, tx, 55 * S, NAVY, { maxWidth: maxW });
  parts.push(label.svg, biz.svg);
  if (rating) {
    const r = 8 * S, gap = 2.5 * S;
    for (let i = 0; i < 5; i++) {
      const cx = tx + r + i * (2 * r + gap);
      const fillFrac = Math.max(0, Math.min(1, rating - i));
      parts.push(star(cx, 75 * S, r, GOLD, fillFrac * 2 * r));
    }
    const after = tx + 5 * (2 * r + gap) + 4 * S;
    const num = text(rating.toFixed(1), 700, 14 * S, after, 80.5 * S, NAVY);
    const on = text(reviews ? `on Google (${reviews})` : 'on Google', 500, 12 * S, after + num.width + 5 * S, 80.5 * S, GRAY, { maxWidth: W - (after + num.width + 5 * S) - 14 * S });
    parts.push(num.svg, on.svg);
  } else {
    parts.push(text('Verified local business', 600, 12.5 * S, tx, 80 * S, GRAY).svg);
  }
  parts.push(text('Sioux Falls Go', 600, 11 * S, tx, 102 * S, NAVY).svg);
  const siteW = F[600].getAdvanceWidth('Sioux Falls Go', 11 * S);
  parts.push(text('· siouxfallsgo.com', 500, 11 * S, tx + siteW + 4 * S, 102 * S, GRAY).svg);
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`, W, H, sealSize, pad };
}

function readFrontmatter(raw) {
  const fm = raw.match(/^---\n([\s\S]*?)\n---/)?.[1] || '';
  const get = (k) => { const v = fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm'))?.[1]?.trim(); if (!v) return undefined; try { return v.startsWith('"') ? JSON.parse(v) : v; } catch { return v; } };
  return { name: get('name'), tier: get('partnershipTier'), rating: Number(get('googleRating')) || null, reviews: Number(get('googleReviewCount')) || null };
}

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });
const seal = path.join(ROOT, 'public', 'images', 'community-champion-seal.png');
const sealHash = crypto.createHash('sha1').update(fs.readFileSync(seal)).digest('hex').slice(0, 8);
const dir = path.join(ROOT, 'src', 'content', 'businesses');
let made = 0, cached = 0;
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
  const b = readFrontmatter(fs.readFileSync(path.join(dir, f), 'utf8'));
  if (b.tier !== 'community-champion' || !b.name) continue;
  const slug = f.replace(/\.md$/, '');
  const key = crypto.createHash('sha1').update(JSON.stringify([VERSION, sealHash, b.name, b.rating, b.reviews])).digest('hex').slice(0, 12);
  const cacheFile = path.join(CACHE, `${slug}-${key}.png`);
  if (!fs.existsSync(cacheFile)) {
    const { svg, sealSize, pad, H } = badgeSvg(b.name, b.rating, b.reviews);
    const sealPng = await sharp(seal).resize(sealSize, sealSize).png().toBuffer();
    await sharp(Buffer.from(svg)).composite([{ input: sealPng, left: pad, top: Math.round((H - sealSize) / 2) }]).png({ compressionLevel: 9, palette: false }).toFile(cacheFile);
    made++;
  } else cached++;
  fs.copyFileSync(cacheFile, path.join(OUT, `${slug}.png`));
}
console.log(`badges: ${made} drawn, ${cached} from cache`);
