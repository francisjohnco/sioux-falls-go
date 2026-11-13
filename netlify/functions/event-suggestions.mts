import { getStore } from '@netlify/blobs';
import { isAdmin } from './_shared/auth.mts';

// The review list for events the weekly search found. GET returns what is
// waiting. POST removes one: "accept" after the admin has saved it as a real
// event, "dismiss" to reject it (remembered, so it is not suggested again).
export default async (req: Request) => {
  const cookieHeader = req.headers.get('cookie') || '';
  if (!isAdmin(cookieHeader)) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });

  const pending = getStore('pending-events');
  const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

  if (req.method === 'GET') {
    const { blobs } = await pending.list();
    const items = (await Promise.all(blobs.map((b) => pending.get(b.key, { type: 'json' })))).filter(Boolean) as any[];
    items.sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
    return json({ suggestions: items });
  }

  if (req.method === 'POST') {
    const body = await req.json().catch(() => null);
    if (!body?.id || (body.action !== 'accept' && body.action !== 'dismiss')) return json({ error: 'id and action (accept or dismiss) are required' }, 400);
    await pending.delete(String(body.id));
    if (body.action === 'dismiss') await getStore('events-dismissed').set(String(body.id), new Date().toISOString());
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
};

export const config = { path: '/api/event-suggestions' };
