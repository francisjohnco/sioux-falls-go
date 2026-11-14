import { getStore } from '@netlify/blobs';
import { isAdmin, makeToken } from './_shared/auth.mts';
import { photoKeys, searchBoth, markUsed, setArticleHero, choiceFromCandidate, type Candidate } from './_shared/hero-photo.mts';
import { readText, commitTextFiles } from './_shared/git-batch.mts';

// Admin controls for header photos.
//   GET                          status of the photo finder and which keys are set
//   POST { action: 'run' }       start the photo finder now
//   POST { action: 'search', q } photo choices from Unsplash and Pexels
//   POST { action: 'set', slug, candidate, alt }  use a photo you picked (locks it)

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

export default async (req: Request) => {
  if (!isAdmin(req.headers.get('cookie') || '')) return json({ error: 'Not authenticated' }, 401);
  const store = getStore('hero-photos');

  if (req.method === 'GET') {
    const status = (await store.get('status', { type: 'json' })) || {};
    return json({ ...status, keys: photoKeys() });
  }

  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === 'run') {
      const base = process.env.URL || 'https://siouxfallsgo.com';
      await fetch(`${base}/api/hero-backfill-background`, { method: 'POST', headers: { 'x-sfg-task': makeToken('hero-backfill', 1) } });
      return json({ ok: true, message: 'The photo finder is running. Each article takes about 15 seconds, and photos show on the site after the next rebuild.' });
    }

    if (body.action === 'search') {
      const q = String(body.q || '').trim().slice(0, 80);
      if (!q) return json({ error: 'Type what the photo should show.' }, 400);
      const keys = photoKeys();
      if (!keys.unsplash && !keys.pexels) return json({ error: 'Add UNSPLASH_ACCESS_KEY or PEXELS_API_KEY in Netlify first.' }, 400);
      return json({ candidates: await searchBoth(q, 12) });
    }

    if (body.action === 'set') {
      const slug = String(body.slug || '');
      if (!/^[a-z0-9-]+$/.test(slug)) return json({ error: 'Invalid article' }, 400);
      const c = body.candidate as Candidate;
      if (!c || !['Unsplash', 'Pexels'].includes(c.provider) || !/^https:\/\/images\.(unsplash|pexels)\.com\//.test(c.url)) return json({ error: 'Pick a photo from the results.' }, 400);
      const alt = String(body.alt || c.description || '').trim();
      if (alt.length < 8) return json({ error: 'Describe the photo in a few words (this is the alt text Google reads).' }, 400);
      const path = `src/content/articles/${slug}.md`;
      const raw = await readText(path);
      if (!raw) return json({ error: 'That article was not found.' }, 404);
      const choice = choiceFromCandidate(c, alt);
      await commitTextFiles([{ path, content: setArticleHero(raw, { heroImage: choice.heroImage, heroImageAlt: choice.heroImageAlt, heroImageCredit: choice.heroImageCredit, locked: true }) }], `Header photo chosen for ${slug}`);
      await markUsed(c);
      return json({ ok: true, message: 'Saved. The article shows the new photo in about a minute.' });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err: any) {
    return json({ error: err?.message || 'Something went wrong' }, 502);
  }
};

export const config = { path: '/api/hero-photo' };
