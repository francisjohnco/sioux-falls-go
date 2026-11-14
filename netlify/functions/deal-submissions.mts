import { getStore } from '@netlify/blobs';
import { isAdmin } from './_shared/auth.mts';
import { getFile, putFile } from './_shared/business-file.mts';

// Admin: review deals businesses sent from /local-deals/black-friday/.
//   GET                                      waiting submissions
//   POST { action: 'approve', id, businessSlug, ...edits }  creates the deal file
//   POST { action: 'reject', id }

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const TYPES = ['percent-off', 'dollar-off', 'bogo', 'free-item', 'bundle', 'other'];

export default async (req: Request) => {
  if (!isAdmin(req.headers.get('cookie') || '')) return json({ error: 'Not authenticated' }, 401);
  const store = getStore('deal-submissions');

  if (req.method === 'GET') {
    const { blobs } = await store.list();
    const items = (await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' })))).filter(Boolean);
    items.sort((a: any, b: any) => String(a.submittedAt).localeCompare(String(b.submittedAt)));
    return json({ submissions: items });
  }

  const body = await req.json().catch(() => ({}));
  const id = String(body.id || '');
  const sub: any = id ? await store.get(id, { type: 'json' }) : null;
  if (!sub) return json({ error: 'That submission is gone.' }, 404);

  if (body.action === 'reject') { await store.delete(id); return json({ ok: true }); }

  if (body.action === 'approve') {
    const slug = String(body.businessSlug || sub.businessSlug || '');
    if (!/^[a-z0-9-]+$/.test(slug)) return json({ error: 'Choose which listing this deal belongs to. If the business is not listed yet, add it in Directory first.' }, 400);
    if (!(await getFile(`src/content/businesses/${slug}.md`))) return json({ error: 'That business is not in the directory yet. Add it first, then approve.' }, 400);
    const title = String(body.title ?? sub.title).trim().slice(0, 80);
    const description = String(body.description ?? sub.description).trim().slice(0, 300);
    if (!title || !description) return json({ error: 'A deal needs a title and description.' }, 400);
    const deal: Record<string, unknown> = {
      business: slug, title, description,
      discountType: TYPES.includes(body.discountType ?? sub.discountType) ? (body.discountType ?? sub.discountType) : 'other',
      valueScore: 60, submittedBy: 'business-owner', promotion: 'black-friday',
    };
    const starts = String(body.startsAt ?? sub.startsAt ?? ''), ends = String(body.endsAt ?? sub.endsAt ?? '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(starts)) deal.activatesAt = starts;
    if (/^\d{4}-\d{2}-\d{2}$/.test(ends)) deal.expiresAt = ends;
    const terms = String(body.terms ?? sub.terms ?? '').trim();
    if (terms) deal.terms = terms.slice(0, 200);
    const fileId = `${slug}-black-friday-${new Date().getFullYear()}-${Date.now().toString(36)}`;
    await putFile(`src/content/deals/${fileId}.json`, Buffer.from(JSON.stringify(deal, null, 2) + '\n').toString('base64'), `Black Friday deal approved: ${slug}`);
    await store.delete(id);
    return json({ ok: true, message: 'Approved. It shows on the Black Friday page in about a minute.' });
  }

  return json({ error: 'Unknown action' }, 400);
};

export const config = { path: '/api/deal-submissions' };
