import { getStore } from '@netlify/blobs';
import { isAdmin, verifyToken } from './_shared/auth.mts';
import { findHeroPhoto, setArticleHero, photoKeys, unsplashRemaining, photoKey } from './_shared/hero-photo.mts';
import { commitTextFiles } from './_shared/git-batch.mts';
import { loadArticles, needsPhoto } from './_shared/article-scan.mts';

// Works through every article that does not have a chosen header photo yet
// (no alt text and not locked by a person), finds the best photo, and commits
// the changes in batches. Runs hourly from hero-backfill.mts until every
// article is done, then once a day to catch new ones. Also runs when you
// click "Find photos now" in Admin.

const SITE = 'https://siouxfallsgo.com';
const TIME_BUDGET_MS = 11 * 60 * 1000;
const COMMIT_EVERY = 8;
const RETRY_SKIPPED_AFTER_DAYS = 7;

export default async (req: Request) => {
  const cookie = req.headers.get('cookie') || '';
  if (!isAdmin(cookie) && verifyToken(req.headers.get('x-sfg-task')) !== 'hero-backfill') return new Response('Not authorized', { status: 401 });

  const store = getStore('hero-photos');
  const prev: any = (await store.get('status', { type: 'json' })) || {};
  if (prev.running && Date.now() - Date.parse(prev.startedAt) < 14 * 60 * 1000) return new Response('Already running');

  const started = Date.now();
  const log: string[] = [];
  const status: any = { ...prev, running: true, startedAt: new Date().toISOString(), keys: photoKeys() };
  await store.setJSON('status', status);

  try {
    const keys = photoKeys();
    if (!keys.anthropic || (!keys.unsplash && !keys.pexels)) {
      throw new Error(!keys.anthropic ? 'ANTHROPIC_API_KEY is missing in Netlify.' : 'Add UNSPLASH_ACCESS_KEY or PEXELS_API_KEY in Netlify so the photo finder has photos to choose from.');
    }
    const articles = await loadArticles();
    const manifest: Record<string, { src: string }> = await fetch(`${SITE}/hero-manifest.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    const skipped: Record<string, string> = (await store.get('skipped', { type: 'json' })) || {};
    const today = new Date().toISOString().slice(0, 10);
    const recentSkip = (slug: string) => skipped[slug] && (Date.now() - Date.parse(skipped[slug])) / 86400000 < RETRY_SKIPPED_AFTER_DAYS;

    // Live articles first (newest first), then scheduled ones (soonest first).
    const todo = articles.filter((a) => needsPhoto(a) && !recentSkip(a.slug)).sort((a, b) => {
      const la = a.publishedAt <= today, lb = b.publishedAt <= today;
      if (la !== lb) return la ? -1 : 1;
      return la ? b.publishedAt.localeCompare(a.publishedAt) : a.publishedAt.localeCompare(b.publishedAt);
    });

    // Never give two articles the same photo.
    const used = new Set(articles.map((a) => a.heroImage).filter((u): u is string => !!u && u.startsWith('https://')).map(photoKey));
    let pending: { path: string; content: string }[] = [];
    let changed = 0;
    const flush = async () => {
      if (!pending.length) return;
      await commitTextFiles(pending, `Header photos: ${pending.length} article${pending.length === 1 ? '' : 's'}`);
      changed += pending.length;
      pending = [];
    };

    for (const a of todo) {
      if (Date.now() - started > TIME_BUDGET_MS) { log.push('Paused for time, continues next hour.'); break; }
      if (keys.unsplash && !keys.pexels && unsplashRemaining < 6) { log.push('Paused for the Unsplash hourly limit, continues next hour.'); break; }
      let current: string | undefined;
      const credited = /^heroImageCredit:/m.test(a.raw); // a remote photo can only be kept if it is credited
      if (a.heroImage?.startsWith('https://images.unsplash.com/') && credited) current = `${a.heroImage}${a.heroImage.includes('?') ? '&' : '?'}w=480`;
      else if (a.heroImage?.startsWith('https://images.pexels.com/') && credited) current = `${a.heroImage.split('?')[0]}?auto=compress&cs=tinysrgb&w=480`;
      else if (a.heroImage && manifest[a.heroImage]) current = SITE + manifest[a.heroImage].src;
      try {
        const r = await findHeroPhoto({ title: a.title, description: a.description, category: a.category, currentImageUrl: current, exclude: used });
        if (r.kind === 'new') {
          used.add(photoKey(r.choice.heroImage));
          pending.push({ path: a.path, content: setArticleHero(a.raw, { heroImage: r.choice.heroImage, heroImageAlt: r.choice.heroImageAlt, heroImageCredit: r.choice.heroImageCredit }) });
          log.push(`New photo: ${a.title}`);
        } else if (r.kind === 'keep') {
          pending.push({ path: a.path, content: setArticleHero(a.raw, { heroImageAlt: r.alt }) });
          log.push(`Kept current photo: ${a.title}`);
        } else {
          skipped[a.slug] = new Date().toISOString();
          log.push(`No good photo yet: ${a.title} (${r.reason})`);
        }
      } catch (err: any) {
        log.push(`Error on ${a.title}: ${err?.message || err}`);
      }
      if (pending.length >= COMMIT_EVERY) await flush();
    }
    await flush();
    await store.setJSON('skipped', skipped);

    const remaining = articles.filter(needsPhoto).length - changed;
    Object.assign(status, {
      running: false, lastRun: new Date().toISOString(), lastChanged: changed,
      total: articles.length, remaining: Math.max(0, remaining),
      waitingForManualPick: Object.keys(skipped).filter((s) => articles.some((a) => a.slug === s && needsPhoto(a))).length,
      log: [...log, ...(prev.log || [])].slice(0, 60), error: null,
    });
  } catch (err: any) {
    Object.assign(status, { running: false, lastRun: new Date().toISOString(), error: err?.message || String(err), log: [...log, ...(prev.log || [])].slice(0, 60) });
  }
  await store.setJSON('status', status);
  return new Response('done');
};

export const config = { path: '/api/hero-backfill-background', background: true };
