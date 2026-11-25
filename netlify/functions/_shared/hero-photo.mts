import Anthropic from '@anthropic-ai/sdk';

// Finds a beautiful, relevant header photo for an article.
//
//   1. Claude writes two photo searches for the article (what the photo
//      should actually show, not just the category name).
//   2. Unsplash and Pexels are searched (whichever has a key in Netlify).
//   3. Claude LOOKS at the candidates, plus the article's current image when
//      it has one, and picks the best fit, or none if nothing fits. It
//      rejects text overlays, logos, watermarks, odd crops, and scenes that
//      clearly are not the Midwest.
//   4. It writes the alt text from what it saw.
//
// Photos are shown from Unsplash and Pexels' own servers (their CDN resizes
// them, and Unsplash requires hotlinking), so nothing large lands in the repo.

export interface Candidate {
  provider: 'Unsplash' | 'Pexels';
  id: string;
  url: string;        // base URL; the site adds size parameters
  thumb: string;      // about 400px, for previews and for Claude to look at
  description: string;
  photographer: string;
  profileUrl: string;
  downloadLocation?: string; // Unsplash asks to be told when a photo is used
}

export interface HeroChoice {
  heroImage: string;
  heroImageAlt: string;
  heroImageCredit: { photographer: string; profileUrl: string; source: string };
  candidate?: Candidate;
}

export const photoKeys = () => ({ unsplash: !!process.env.UNSPLASH_ACCESS_KEY, pexels: !!process.env.PEXELS_API_KEY, anthropic: !!process.env.ANTHROPIC_API_KEY });

// Remaining Unsplash requests this hour, from the last response. The demo key
// allows 50 an hour, a production key 5,000.
export let unsplashRemaining = Infinity;

export async function searchUnsplash(query: string, perPage = 8): Promise<Candidate[]> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return [];
  const res = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape&content_filter=high`, {
    headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' },
  });
  const left = Number(res.headers.get('x-ratelimit-remaining'));
  if (Number.isFinite(left)) unsplashRemaining = left;
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results || []).filter((p: any) => p.width >= 1600).map((p: any) => ({
    provider: 'Unsplash' as const,
    id: p.id,
    url: p.urls.raw,
    thumb: p.urls.small,
    description: p.alt_description || p.description || '',
    photographer: p.user?.name || 'Unsplash',
    profileUrl: `${p.user?.links?.html || 'https://unsplash.com'}?utm_source=sioux_falls_go&utm_medium=referral`,
    downloadLocation: p.links?.download_location,
  }));
}

export async function searchPexels(query: string, perPage = 8): Promise<Candidate[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];
  const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape&size=large`, {
    headers: { Authorization: key },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.photos || []).map((p: any) => ({
    provider: 'Pexels' as const,
    id: String(p.id),
    url: p.src.original.split('?')[0],
    thumb: `${p.src.original.split('?')[0]}?auto=compress&cs=tinysrgb&w=480`,
    description: p.alt || '',
    photographer: p.photographer || 'Pexels',
    profileUrl: p.photographer_url || 'https://www.pexels.com',
  }));
}

export async function searchBoth(query: string, perProvider = 8): Promise<Candidate[]> {
  const [u, p] = await Promise.all([searchUnsplash(query, perProvider).catch(() => []), searchPexels(query, perProvider).catch(() => [])]);
  // interleave so neither source crowds out the other
  const out: Candidate[] = [];
  for (let i = 0; i < Math.max(u.length, p.length); i++) { if (u[i]) out.push(u[i]); if (p[i]) out.push(p[i]); }
  return out;
}

// Unsplash's API terms: tell them when a photo is actually used.
export async function markUsed(c?: Candidate): Promise<void> {
  if (c?.provider !== 'Unsplash' || !c.downloadLocation || !process.env.UNSPLASH_ACCESS_KEY) return;
  await fetch(c.downloadLocation, { headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` } }).catch(() => {});
}

export function choiceFromCandidate(c: Candidate, alt: string): HeroChoice {
  return { heroImage: c.url, heroImageAlt: alt.slice(0, 160), heroImageCredit: { photographer: c.photographer, profileUrl: c.profileUrl, source: c.provider }, candidate: c };
}

const client = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';

function parseJson(text: string): any {
  const m = text.match(/\{[\s\S]*\}/);
  try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
}

async function searchQueries(a: { title: string; description?: string; category?: string; mustShow?: string }): Promise<string[]> {
  const msg = await client().messages.create({
    model: MODEL, max_tokens: 200,
    messages: [{ role: 'user', content: `Write two stock photo searches (2 to 5 words each) for the header photo of this local guide on a Sioux Falls, South Dakota website. Each search should describe what the photo should SHOW (a concrete scene, object, or person doing the work), not the topic in abstract. The first should be the most direct scene; the second a softer, more atmospheric alternative.${a.mustShow ? ` Both searches MUST describe ${a.mustShow}; never search for anything else.` : ''}\n\nTitle: ${a.title}\nSummary: ${a.description || ''}\nCategory: ${a.category || ''}\n\nRespond with only JSON like {"queries": ["plumber clearing kitchen drain", "clean modern kitchen sink"]}` }],
  });
  const t = msg.content.find((b: any) => b.type === 'text') as any;
  const q = parseJson(t?.text || '')?.queries;
  const out = Array.isArray(q) && q.length ? q.slice(0, 2).map(String) : [a.title];
  // A plain, reliable search as the last resort for subject-locked categories.
  const fallback = subjectEntry(a.category)?.query;
  if (a.mustShow && fallback) out.push(fallback);
  return out;
}

// Asks Claude to look at the photos and pick one. index 0 is the current image when given.
async function pickWithVision(
  a: { title: string; description?: string; mustShow?: string },
  options: { thumb: string; description: string; isCurrent?: boolean }[],
): Promise<{ index: number; alt: string } | null> {
  const content: any[] = [{
    type: 'text',
    text: `You are choosing the header photo for a local guide on Sioux Falls Go, a website for Sioux Falls, South Dakota.\n\nArticle title: ${a.title}\nSummary: ${a.description || ''}\n\nBelow are ${options.length} numbered photos.${options[0]?.isCurrent ? ' Photo 0 is the image the article uses now.' : ''}\n\nPick the single photo that is BOTH clearly about this article's subject AND beautiful: sharp, well lit, natural looking, inviting, works as a wide 16:9 banner.\n\nReject any photo that has text, words, logos, watermarks, or graphic design overlaid; looks like a cheesy posed stock cliche; shows a clearly non-American setting (European street signs, tropical landmarks, foreign storefronts); or is only loosely related to the subject. A photo showing a generic city or park is NOT acceptable for a home services, trade, or shopping topic.${a.mustShow ? ` The photo MUST clearly show ${a.mustShow}. Reject every photo that does not, however nice it is. For this site section, any beautiful, well lit photo of ${a.mustShow} fits the article, even if it does not show the article's exact detail; prefer one that comes closest to the article's angle.` : ''}\n\nThen write alt text for the chosen photo: one plain sentence under 120 characters describing what is actually visible. Do not start with "Image of" or "Photo of", and do not claim the photo shows Sioux Falls unless it clearly does.\n\nRespond with only JSON: {"choice": <number, or -1 if none is good enough>, "alt": "<alt text>"}`,
  }];
  options.forEach((o, i) => {
    content.push({ type: 'text', text: `Photo ${i}${o.isCurrent ? ' (current image)' : ''}${o.description ? `: ${o.description}` : ''}` });
    content.push({ type: 'image', source: { type: 'url', url: o.thumb } });
  });
  const msg = await client().messages.create({ model: MODEL, max_tokens: 300, messages: [{ role: 'user', content }] });
  const t = msg.content.find((b: any) => b.type === 'text') as any;
  const r = parseJson(t?.text || '');
  if (!r || typeof r.choice !== 'number' || r.choice < 0 || r.choice >= options.length) return null;
  return { index: r.choice, alt: String(r.alt || '').replace(/[–—]/g, ', ').trim() };
}

export type FindResult =
  | { kind: 'new'; choice: HeroChoice }
  | { kind: 'keep'; alt: string }
  | { kind: 'none'; reason: string };

// currentImageUrl must be a public absolute URL (Claude fetches it to look at it).
// Photos already used by another article, compared without size parameters.
export const photoKey = (u: string) => u.split('?')[0];

// Categories whose header photos must show one specific subject, no matter
// what the article is about. Keyed by category slug or name.
const PHOTO_SUBJECTS: Record<string, { show: string; query: string }> = {
  'bathroom-remodeling': { show: 'a residential bathroom (shower, tub, vanity, tile, or toilet area)', query: 'modern bathroom interior' },
  'plumbers': { show: 'residential plumbing (pipes, a water heater, a sink or faucet, or a plumber at work in a home)', query: 'plumber fixing pipe under sink' },
  'siding': { show: "house siding as the clear subject (a home exterior with visible siding, or siding being installed)", query: "house exterior vinyl siding" },
  'gutters': { show: "house gutters or downspouts as the clear subject", query: "house gutter downspout" },
  'insulation': { show: "home insulation as the clear subject (attic insulation, insulation being installed, or an attic)", query: "attic insulation installation" },
  'fencing': { show: "a residential fence as the clear subject (a backyard fence, or a fence being built)", query: "backyard wood fence" },
  'deck-builders': { show: "a residential deck as the clear subject (a backyard deck or a deck being built)", query: "backyard wood deck" },
  'basement-waterproofing': { show: "a residential basement or foundation as the clear subject (basement walls, a sump pump, or foundation work)", query: "basement foundation wall" },
  'kitchen-remodeling': { show: "a residential kitchen as the clear subject (cabinets, counters, or a kitchen being remodeled)", query: "modern home kitchen interior" },
  'snow-removal': { show: "snow removal at a home (a snowy driveway or sidewalk, a snow blower, shoveling, or a small plow)", query: "snow blower driveway" },
  'window-replacement': { show: 'residential windows as the clear subject (a window being installed, or a home where the windows are the focus)', query: 'new windows house interior' },
};
const subjectEntry = (category?: string) => (category ? PHOTO_SUBJECTS[category.toLowerCase().trim().replace(/\s+/g, '-')] : undefined);
export function photoSubjectFor(category?: string): string | undefined {
  return subjectEntry(category)?.show;
}

export async function findHeroPhoto(a: { title: string; description?: string; category?: string; currentImageUrl?: string; exclude?: Set<string>; mustShow?: string; queries?: string[] }): Promise<FindResult> {
  a = { ...a, mustShow: a.mustShow || photoSubjectFor(a.category) };
  const keys = photoKeys();
  if (!keys.anthropic) return { kind: 'none', reason: 'ANTHROPIC_API_KEY is not set' };
  if (!keys.unsplash && !keys.pexels) return { kind: 'none', reason: 'No photo source key. Add UNSPLASH_ACCESS_KEY or PEXELS_API_KEY in Netlify.' };

  // A topic can name its own photo searches when the automatic ones miss.
  const queries = a.queries?.length ? a.queries.slice(0, 3) : await searchQueries(a);
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  // Every search gets a fair share of the 12 photos the picker looks at, so
  // the plain fallback search is never crowded out.
  const share = Math.ceil(12 / queries.length);
  for (const q of queries) {
    let taken = 0;
    for (const c of await searchBoth(q, 6)) {
      const k = `${c.provider}:${c.id}`;
      if (taken < share && !seen.has(k) && !a.exclude?.has(photoKey(c.url))) { seen.add(k); candidates.push(c); taken++; }
    }
  }
  const pool = candidates.slice(0, 12);
  if (!pool.length && !a.currentImageUrl) return { kind: 'none', reason: `No photos found for: ${queries.join(' / ')}` };

  const options = [
    ...(a.currentImageUrl ? [{ thumb: a.currentImageUrl, description: '', isCurrent: true }] : []),
    ...pool.map((c) => ({ thumb: c.thumb, description: c.description })),
  ];
  const pick = await pickWithVision(a, options);
  if (!pick) return { kind: 'none', reason: `None of ${pool.length} photos fit (searched: ${queries.join(' / ')})` };
  if (a.currentImageUrl && pick.index === 0) return { kind: 'keep', alt: pick.alt };
  const c = pool[pick.index - (a.currentImageUrl ? 1 : 0)];
  await markUsed(c);
  return { kind: 'new', choice: choiceFromCandidate(c, pick.alt) };
}

// Replaces the hero fields in an article file's frontmatter.
export function setArticleHero(raw: string, hero: { heroImage?: string; heroImageAlt: string; heroImageCredit?: HeroChoice['heroImageCredit'] | null; locked?: boolean }): string {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error('Article file has no frontmatter');
  const keys = ['heroImage', 'heroImageAlt', 'heroImageCredit', 'heroImageLocked'];
  const lines = m[1].split('\n');
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const key = lines[i].match(/^([A-Za-z]+):/)?.[1];
    if (key && keys.includes(key)) {
      while (i + 1 < lines.length && /^\s/.test(lines[i + 1])) i++; // skip nested lines
      continue;
    }
    kept.push(lines[i]);
  }
  const prevImage = m[1].match(/^heroImage:\s*"?([^"\n]+)"?\s*$/m)?.[1];
  const image = hero.heroImage ?? prevImage;
  if (image) kept.push(`heroImage: ${JSON.stringify(image)}`);
  kept.push(`heroImageAlt: ${JSON.stringify(hero.heroImageAlt)}`);
  if (hero.heroImageCredit) {
    kept.push('heroImageCredit:');
    for (const [k, v] of Object.entries(hero.heroImageCredit)) kept.push(`  ${k}: ${JSON.stringify(v)}`);
  } else if (hero.heroImageCredit === undefined) {
    // keep the old credit only when the image did not change
    const old = m[1].match(/^heroImageCredit:\n((?:\s+.*\n?)+)/m);
    if (old && !hero.heroImage) kept.push(`heroImageCredit:\n${old[1].replace(/\n$/, '')}`);
  }
  if (hero.locked) kept.push('heroImageLocked: true');
  return `---\n${kept.join('\n')}\n---\n${m[2]}`;
}

// Sets the header photo fields in a category's JSON file.
export function setCategoryHero(raw: string, hero: { heroImage: string; heroImageAlt: string; heroImageCredit?: HeroChoice['heroImageCredit'] | null; locked?: boolean }): string {
  const c = JSON.parse(raw);
  c.heroImage = hero.heroImage;
  c.heroImageAlt = hero.heroImageAlt;
  if (hero.heroImageCredit) c.heroImageCredit = hero.heroImageCredit; else delete c.heroImageCredit;
  if (hero.locked) c.heroImageLocked = true; else delete c.heroImageLocked;
  return JSON.stringify(c, null, 2) + '\n';
}
