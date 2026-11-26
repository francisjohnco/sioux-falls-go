import { getStore } from '@netlify/blobs';
import { isAdmin, randomToken } from './_shared/auth.mts';
import { gscClient, daysAgo } from './_shared/gsc.mts';

// Outreach tracker for reaching unverified businesses.
//   GET  → every saved outreach record, plus Google numbers per page for the
//          last 28 days (cached six hours) so each card can open with a real stat.
//   POST { slug, patch } → merges patch into that business's record. A patch
//          can carry `logEntry`, which is appended to the record's history.
// Records live in Netlify Blobs, not in the business files, so logging a call
// never triggers a site rebuild.

type LogEntry = { at: string; what: string };
type Rec = {
  stage?: 'contacted' | 'talking' | 'answered' | 'verified' | 'no';
  code?: string; // private owner-questions link code: /verify/?c=<code>
  answeredAt?: string;
  touches?: number;
  nextAt?: string; // YYYY-MM-DD
  email?: string;
  note?: string;
  log?: LogEntry[];
  updatedAt?: string;
};

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const CACHE_HOURS = 6;
const STAGES = ['contacted', 'talking', 'answered', 'verified', 'no'];

async function pageStats(): Promise<{ ok: boolean; pages: Record<string, { clicks: number; impressions: number }>; note?: string }> {
  const store = getStore('outreach');
  const cached: any = await store.get('gsc-pages', { type: 'json' });
  if (cached && Date.now() - cached.at < CACHE_HOURS * 3600 * 1000) return cached.data;
  try {
    const q = await gscClient();
    if (!q) return { ok: false, pages: {}, note: 'Search Console not connected' };
    const rows = await q({ startDate: daysAgo(30), endDate: daysAgo(2), dimensions: ['page'], rowLimit: 2000 });
    const pages: Record<string, { clicks: number; impressions: number }> = {};
    for (const r of rows) {
      let path = '';
      try { path = new URL(r.keys?.[0] || '').pathname; } catch { continue; }
      if (!path.endsWith('/')) path += '/';
      const cur = pages[path] || { clicks: 0, impressions: 0 };
      cur.clicks += r.clicks; cur.impressions += r.impressions;
      pages[path] = cur;
    }
    const data = { ok: true, pages };
    await store.setJSON('gsc-pages', { at: Date.now(), data });
    return data;
  } catch (e: any) {
    return { ok: false, pages: {}, note: e?.message || 'Search Console error' };
  }
}

export default async (req: Request) => {
  if (!isAdmin(req.headers.get('cookie') || '')) return json({ error: 'Not authenticated' }, 401);
  const store = getStore('outreach');
  const records: Record<string, Rec> = ((await store.get('records', { type: 'json' })) as any) || {};

  if (req.method === 'GET') {
    return json({ records, gsc: await pageStats() });
  }

  if (req.method === 'POST') {
    const body: any = await req.json().catch(() => null);
    const slug = String(body?.slug || '');
    const patch = body?.patch || {};
    if (!/^[a-z0-9-]+$/.test(slug)) return json({ error: 'Missing business' }, 400);

    const rec: Rec = { ...(records[slug] || {}) };
    // A private link the owner uses to answer the questions. Made once per
    // business and reused, so every message to them carries the same link.
    if (patch.ensureCode && !rec.code) {
      rec.code = randomToken().replace(/[^a-z0-9]/gi, '').slice(0, 10).toLowerCase();
      await store.set(`code-${rec.code}`, slug);
    }
    if (patch.stage !== undefined) {
      if (patch.stage !== null && !STAGES.includes(patch.stage)) return json({ error: 'Unknown stage' }, 400);
      rec.stage = patch.stage || undefined;
    }
    if (typeof patch.touches === 'number') rec.touches = Math.max(0, Math.min(20, Math.round(patch.touches)));
    if (patch.nextAt !== undefined) rec.nextAt = /^\d{4}-\d{2}-\d{2}$/.test(patch.nextAt) ? patch.nextAt : undefined;
    if (typeof patch.email === 'string') rec.email = patch.email.trim().slice(0, 200) || undefined;
    if (typeof patch.note === 'string') rec.note = patch.note.slice(0, 2000) || undefined;
    if (patch.logEntry && typeof patch.logEntry === 'string') {
      rec.log = [...(rec.log || []), { at: new Date().toISOString(), what: patch.logEntry.slice(0, 200) }].slice(-40);
    }
    rec.updatedAt = new Date().toISOString();
    records[slug] = rec;
    await store.setJSON('records', records);
    return json({ ok: true, record: rec });
  }

  return json({ error: 'Method not allowed' }, 405);
};

export const config = { path: '/api/outreach' };
