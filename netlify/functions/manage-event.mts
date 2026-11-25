import { slugify } from './_shared/article-file.mts';
import { isValidDateString } from './_shared/schedule.mts';
import { isAdmin } from './_shared/auth.mts';

// Env vars required: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO
//
// Creates, edits, and deletes event files in src/content/events. The
// calendar page and the homepage both read those files, so saving here
// updates both on the next rebuild.

const CATEGORIES = ['family', 'downtown', 'music', 'sports', 'market'];

function validate(ev: any): string | null {
  if (!ev || typeof ev.title !== 'string' || !ev.title.trim()) return 'Title is required';
  if (typeof ev.description !== 'string' || !ev.description.trim()) return 'Description is required';
  if (!CATEGORIES.includes(ev.category)) return `Category must be one of: ${CATEGORIES.join(', ')}`;
  if (!Array.isArray(ev.occurrences) || ev.occurrences.length === 0) return 'At least one date is required';
  for (const o of ev.occurrences) {
    if (!isValidDateString(o?.date)) return `Not a valid date: ${o?.date}`;
    if (o.endDate && (!isValidDateString(o.endDate) || o.endDate < o.date)) return `End date must be on or after ${o.date}`;
  }
  if (typeof ev.location !== 'string' || !ev.location.trim()) return 'Location is required';
  if (typeof ev.sourceName !== 'string' || !ev.sourceName.trim()) return 'Source name is required';
  try {
    const u = new URL(ev.sourceUrl);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('protocol');
  } catch {
    return 'Source link must be a full web address starting with https://';
  }
  return null;
}

function cleanEvent(ev: any) {
  const out: Record<string, unknown> = {
    title: ev.title.trim(),
    description: ev.description.trim(),
    category: ev.category,
    occurrences: ev.occurrences.map((o: any) => {
      const item: Record<string, string> = { date: o.date };
      if (o.endDate) item.endDate = o.endDate;
      if (o.time && String(o.time).trim()) item.time = String(o.time).trim();
      return item;
    }),
    location: ev.location.trim(),
    photo: typeof ev.photo === 'string' && ev.photo.startsWith('/images/') ? ev.photo : '/images/scenic/downtown-1.jpg',
    sourceName: ev.sourceName.trim(),
    sourceUrl: ev.sourceUrl.trim(),
  };
  if (ev.note && String(ev.note).trim()) out.note = String(ev.note).trim();
  const biz = Array.isArray(ev.businesses) ? [...new Set(ev.businesses.map(String).filter((b: string) => /^[a-z0-9-]+$/.test(b)))].slice(0, 10) : [];
  if (biz.length) out.businesses = biz;
  return out;
}

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  const cookieHeader = req.headers.get('cookie') || '';
  if (!isAdmin(cookieHeader)) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });

  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    return new Response(JSON.stringify({ error: 'GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO not configured' }), { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
  if (!body || (body.action !== 'save' && body.action !== 'delete')) return json({ error: 'action must be save or delete' }, 400);

  let id: string;
  if (body.action === 'delete') {
    id = String(body.id || '');
  } else {
    const problem = validate(body.event);
    if (problem) return json({ error: problem }, 400);
    id = body.id ? String(body.id) : slugify(body.event.title).slice(0, 60);
  }
  if (!/^[a-z0-9-]+$/.test(id)) return json({ error: 'Invalid event id' }, 400);

  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/src/content/events/${id}.json`;
  const headers = { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' };

  try {
    const existing = await fetch(apiUrl, { headers });
    const sha: string | undefined = existing.ok ? (await existing.json()).sha : undefined;

    if (body.action === 'delete') {
      if (!sha) return json({ error: 'Event not found' }, 404);
      const res = await fetch(apiUrl, {
        method: 'DELETE',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Admin: remove event ${id}`, sha }),
      });
      if (!res.ok) return json({ error: 'GitHub delete failed', detail: await res.text() }, 502);
      return json({ ok: true, id, deleted: true });
    }

    // Creating with a name that already exists must not silently overwrite.
    if (sha && !body.id) return json({ error: 'An event with that name already exists. Edit it instead, or change the title.' }, 409);

    const content = JSON.stringify(cleanEvent(body.event), null, 2) + '\n';
    const res = await fetch(apiUrl, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Admin: ${sha ? 'edit' : 'add'} event ${id}`,
        content: Buffer.from(content).toString('base64'),
        sha,
      }),
    });
    if (!res.ok) return json({ error: 'GitHub commit failed', detail: await res.text() }, 502);
    return json({ ok: true, id });
  } catch (err: any) {
    return json({ error: 'Event save failed', detail: String(err?.message || err) }, 500);
  }
};

export const config = { path: '/api/manage-event' };
