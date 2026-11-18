import { getStore } from '@netlify/blobs';
import { isAdmin } from './_shared/auth.mts';
import { gscClient, daysAgo, type GscRow } from './_shared/gsc.mts';

// Admin Analytics tab: the whole site's Google search performance (totals
// with change, weekly trend, top searches, top pages, and searches where a
// better title could win more clicks), plus what visitors did on every
// business profile this month. Cached for three hours; ?refresh=1 rebuilds.

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

function totals(rows: GscRow[]) {
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  const position = impressions ? rows.reduce((s, r) => s + r.position * r.impressions, 0) / impressions : 0;
  return { clicks, impressions, ctr: impressions ? round((clicks / impressions) * 100) : 0, position: round(position) };
}

const pathOf = (u: string) => { try { return new URL(u).pathname; } catch { return u; } };
function pageType(p: string) {
  if (p.startsWith('/guides/')) return 'Guide';
  if (p.startsWith('/businesses/')) return 'Business';
  if (p.startsWith('/faqs/')) return 'Answers';
  if (p === '/' ) return 'Home';
  if (/^\/[a-z0-9-]+\/?$/.test(p)) return 'Category or page';
  return 'Page';
}

export default async (req: Request) => {
  if (!isAdmin(req.headers.get('cookie') || '')) return json({ error: 'Not authenticated' }, 401);
  const cache = getStore('site-analytics');
  const refresh = new URL(req.url).searchParams.get('refresh') === '1';
  const cached: any = refresh ? null : await cache.get('report', { type: 'json' });
  if (cached && Date.now() - Date.parse(cached.generatedAt) < 3 * 3600000) return json(cached);

  const report: any = { generatedAt: new Date().toISOString(), range: { start: daysAgo(30), end: daysAgo(2) }, gsc: { connected: false }, businesses: [] };

  // Profile activity this month, from our own counter.
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit' }).format(new Date());
  report.month = month;
  const stats = getStore('biz-stats');
  const { blobs } = await stats.list();
  for (const b of blobs.filter((x) => x.key.endsWith(`/${month}`))) {
    const rec: any = (await stats.get(b.key, { type: 'json' })) || {};
    const slug = b.key.split('/')[0];
    const actions = (rec.call || 0) + (rec.directions || 0) + (rec.website || 0) + (rec.quote || 0);
    report.businesses.push({ slug, view: rec.view || 0, call: rec.call || 0, directions: rec.directions || 0, website: rec.website || 0, quote: rec.quote || 0, actions });
  }
  report.businesses.sort((a: any, b: any) => b.actions - a.actions || b.view - a.view);

  try {
    const q = await gscClient();
    if (q) {
      const r = report.range;
      const [cur, prev, queries, pages, daily] = await Promise.all([
        q({ startDate: r.start, endDate: r.end }),
        q({ startDate: daysAgo(58), endDate: daysAgo(31) }),
        q({ startDate: r.start, endDate: r.end, dimensions: ['query'], rowLimit: 250 }),
        q({ startDate: r.start, endDate: r.end, dimensions: ['page'], rowLimit: 250 }),
        q({ startDate: daysAgo(92), endDate: r.end, dimensions: ['date'], rowLimit: 200 }),
      ]);
      const weeks = new Map<string, { week: string; clicks: number; impressions: number }>();
      for (const row of daily) {
        const d = new Date(`${row.keys![0]}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
        const wk = d.toISOString().slice(0, 10);
        const w = weeks.get(wk) || { week: wk, clicks: 0, impressions: 0 };
        w.clicks += row.clicks; w.impressions += row.impressions;
        weeks.set(wk, w);
      }
      const q2 = queries.map((x) => ({ query: x.keys![0], clicks: x.clicks, impressions: x.impressions, ctr: round(x.ctr * 100), position: round(x.position) }));
      const p2 = pages.map((x) => { const p = pathOf(x.keys![0]); return { path: p, type: pageType(p), clicks: x.clicks, impressions: x.impressions, ctr: round(x.ctr * 100), position: round(x.position) }; });
      report.gsc = {
        connected: true,
        current: totals(cur), previous: totals(prev),
        weekly: [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)),
        queries: q2.slice(0, 30),
        pages: p2.slice(0, 30),
        // Seen often, on page one or close to it, but rarely clicked: a better
        // title and description is the fastest win.
        titleWins: p2.filter((p) => p.impressions >= 50 && p.position <= 12 && p.ctr < 2).sort((a, b) => b.impressions - a.impressions).slice(0, 10),
        // Close to the top few results: one stronger page could move these up.
        nearTop: q2.filter((x) => x.impressions >= 20 && x.position > 4 && x.position <= 15).sort((a, b) => b.impressions - a.impressions).slice(0, 10),
      };
    }
  } catch (err: any) {
    report.gsc = { connected: false, error: err?.message || String(err) };
  }

  await cache.setJSON('report', report);
  return json(report);
};

export const config = { path: '/api/site-analytics' };
