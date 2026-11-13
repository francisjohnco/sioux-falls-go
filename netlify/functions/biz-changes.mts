import { getStore } from '@netlify/blobs';
import { isAdmin } from './_shared/auth.mts';
import { readBusinessFile, writeBusinessFile, applyChanges, readField, OWNER_REVIEW_FIELDS } from './_shared/business-file.mts';

// Admin only. Owner edits to the written parts of a profile (story, quotes,
// short description) wait here until you approve or reject them.
const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

export default async (req: Request) => {
  if (!isAdmin(req.headers.get('cookie') || '')) return json({ error: 'Not authenticated' }, 401);
  const store = getStore('business-change-requests');

  if (req.method === 'GET') {
    const { blobs } = await store.list();
    const requests = (await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' })))).filter(Boolean);
    return json({ requests });
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const body = await req.json().catch(() => ({}));
  const slug = String(body.slug || '');
  if (!/^[a-z0-9-]+$/.test(slug)) return json({ error: 'Invalid business' }, 400);
  const request: any = await store.get(slug, { type: 'json' });
  if (!request) return json({ error: 'That request is gone.' }, 404);

  if (body.action === 'reject') { await store.delete(slug); return json({ ok: true }); }
  if (body.action === 'approve') {
    try {
      const allowed: Record<string, string> = {};
      for (const k of OWNER_REVIEW_FIELDS) if (typeof request.changes?.[k] === 'string') allowed[k] = request.changes[k];
      const f = await readBusinessFile(slug);
      const next = applyChanges(f.frontmatter, f.body, allowed);
      await writeBusinessFile(slug, next.frontmatter, next.body, f.sha, `Approved owner edit: ${readField(f.frontmatter, 'name') || slug}`);
      await store.delete(slug);
      return json({ ok: true });
    } catch (err: any) {
      return json({ error: err?.message || 'Approve failed' }, 502);
    }
  }
  return json({ error: 'Unknown action' }, 400);
};

export const config = { path: '/api/biz-changes' };
