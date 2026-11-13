import { getStore } from '@netlify/blobs';
import { isNearDuplicate } from './_shared/article-file.mts';
import { isAdmin } from './_shared/auth.mts';

// One-click cleanup for the review queue. Drafts about the same topic (same
// planned slug, or same category with a closely matching title) are grouped,
// the newest in each group is kept, and the rest are removed.
export default async (req: Request) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  const cookieHeader = req.headers.get('cookie') || '';
  if (!isAdmin(cookieHeader)) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });

  const store = getStore('pending-drafts');
  const { blobs } = await store.list();
  const drafts = (await Promise.all(blobs.map(async ({ key }) => ({ id: key, ...((await store.get(key, { type: 'json' })) as any) }))))
    .sort((a, b) => String(b.generatedAt || '').localeCompare(String(a.generatedAt || ''))); // newest first

  const kept: any[] = [];
  let removed = 0;
  for (const d of drafts) {
    const title = d.draft?.title || '';
    const dup = kept.some((k) =>
      (d.slug && d.slug === k.slug) ||
      (d.categorySlug === k.categorySlug && isNearDuplicate(title, [k.draft?.title || '']))
    );
    if (dup) { await store.delete(d.id); removed++; } else kept.push(d);
  }

  return new Response(JSON.stringify({ ok: true, kept: kept.length, removed }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

export const config = { path: '/api/dedupe-pending-drafts' };
