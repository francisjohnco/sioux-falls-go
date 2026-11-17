// One place that decides an article's header photo and every size of it.
// Every article gets an image, without exception:
//   1. its own chosen photo (Unsplash or Pexels, served from their CDN at the right size), or
//   2. its own local image, optimized at build time into WebP sizes, or
//   3. a safety-net photo that fits its category, until the photo finder picks a real one.

import manifest from '../generated/hero-manifest.json';

type Manifest = Record<string, { srcset: string; src: string; card: string; large: string; og: string }>;
const M = manifest as Manifest;

export interface Hero {
  src: string;        // default <img> src (about 960px wide)
  srcset: string;
  card: string;       // small version for cards and lists
  large: string;      // 1600px, used for preloading on wide screens
  og: string;         // 1200x630 link preview image
  alt: string;
  width: number;
  height: number;
  credit?: { photographer: string; profileUrl: string; source: string };
  isFallback: boolean;
}

const FALLBACK_BY_GROUP: [RegExp, string][] = [
  [/restaurant|dining|coffee|bakeries|breakfast|food|bars|ice-cream|catering/, '/images/stock/restaurant-workers.jpg'],
  [/real-estate|mortgage|property|home-inspectors|custom-home/, '/images/stock/real-estate-keys.jpg'],
  [/lawn|landscap|tree|pressure-washing|window-cleaning/, '/images/stock/lawn-mower.jpg'],
  [/shopping|retail|boutique|gift|for-local-businesses|grow-with-sfg|marketing|spotlight/, '/images/stock/shop-local-chalkboard.jpg'],
  [/plumb|electric|hvac|roof|paint|floor|clean|appliance|handyman|remodel|home|garage|concrete|pest|carpet/, '/images/scenic/mckennan-park.jpg'],
  [/for-locals|consumer|community|local-news/, '/images/scenic/downtown-2.jpg'],
];
const DEFAULT_FALLBACK = '/images/scenic/falls-park-golden.jpg';
const FALLBACK_ALT: Record<string, string> = {
  '/images/stock/restaurant-workers.jpg': 'Restaurant staff serving customers at a buffet counter',
  '/images/stock/real-estate-keys.jpg': 'Real estate agent handing house keys to a couple',
  '/images/stock/lawn-mower.jpg': 'Lawn mower on freshly cut green grass',
  '/images/stock/shop-local-chalkboard.jpg': 'Chalkboard sign reading thank you for shopping local',
  '/images/scenic/mckennan-park.jpg': 'McKennan Park sign and pine trees in Sioux Falls',
  '/images/scenic/downtown-2.jpg': 'Downtown Sioux Falls and the Big Sioux River at sunset',
  '/images/scenic/falls-park-golden.jpg': 'Waterfalls at Falls Park in Sioux Falls',
};

export function fallbackFor(category: string): string {
  for (const [re, img] of FALLBACK_BY_GROUP) if (re.test(category)) return img;
  return DEFAULT_FALLBACK;
}

const isUnsplash = (u: string) => /^https:\/\/images\.unsplash\.com\//.test(u);
const isPexels = (u: string) => /^https:\/\/images\.pexels\.com\//.test(u);

// Unsplash and Pexels both run imgix-style resizing: crop to 16:9 and let the
// CDN send AVIF or WebP when the browser supports it.
function cdnUrl(u: string, w: number, h = Math.round((w * 9) / 16)): string {
  const url = new URL(u);
  for (const k of ['w', 'h', 'fit', 'crop', 'q', 'auto', 'fm', 'cs', 'dpr']) url.searchParams.delete(k);
  if (isUnsplash(u)) {
    url.searchParams.set('w', String(w)); url.searchParams.set('h', String(h));
    url.searchParams.set('fit', 'crop'); url.searchParams.set('crop', 'entropy');
    url.searchParams.set('auto', 'format'); url.searchParams.set('q', w >= 1600 ? '70' : '75');
  } else {
    url.searchParams.set('auto', 'compress'); url.searchParams.set('cs', 'tinysrgb');
    url.searchParams.set('w', String(w)); url.searchParams.set('h', String(h)); url.searchParams.set('fit', 'crop');
  }
  return url.toString();
}

function local(src: string): Omit<Hero, 'alt' | 'credit' | 'isFallback'> | null {
  const m = M[src];
  if (!m) return null;
  return { src: m.src, srcset: m.srcset, card: m.card, large: m.large, og: m.og, width: 1600, height: 900 };
}

export function articleHero(article: { data: any }): Hero {
  const d = article.data;
  const category = typeof d.category === 'string' ? d.category : d.category?.id || '';
  const alt = d.heroImageAlt || d.title;
  const credit = d.heroImageCredit ? { ...d.heroImageCredit, source: d.heroImageCredit.source || (d.heroImage && isPexels(d.heroImage) ? 'Pexels' : 'Unsplash') } : undefined;
  const img: string | undefined = d.heroImage;

  if (img && (isUnsplash(img) || isPexels(img))) {
    return {
      src: cdnUrl(img, 960), srcset: [480, 960, 1600].map((w) => `${cdnUrl(img, w)} ${w}w`).join(', '),
      card: cdnUrl(img, 480), large: cdnUrl(img, 1600), og: cdnUrl(img, 1200, 630),
      width: 1600, height: 900, alt, credit, isFallback: false,
    };
  }
  if (img && img.startsWith('/')) {
    const l = local(img);
    if (l) return { ...l, alt, credit, isFallback: false };
  }
  const fbSrc = M[fallbackFor(category)] ? fallbackFor(category) : DEFAULT_FALLBACK;
  return { ...local(fbSrc)!, alt: FALLBACK_ALT[fbSrc] || 'Sioux Falls, South Dakota', isFallback: true };
}

// A category page's header photo: the category's own photo, never a photo
// borrowed from one of its businesses.
export function categoryHero(category: { data: any }): Hero {
  const d = category.data;
  return articleHero({ data: { ...d, title: `${d.name} in Sioux Falls`, category: d.slug } });
}
