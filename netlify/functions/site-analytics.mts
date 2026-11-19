import { getStore } from '@netlify/blobs';
import { isAdmin } from './_shared/auth.mts';
import { gscClient, daysAgo, type GscRow } from './_shared/gsc.mts';
import { loadStats, sumMonth, sumRange } from './_shared/stats.mts';

// Admin Analytics tab: the whole site's Google search performance (totals
// with change, weekly trend, top searches, top pages, and searches where a
// better title could win more clicks), plus what visitors did on every
// business profile this month. Cached for three hours; ?refresh=1 rebuilds.

const SITE = 'https://siouxfallsgo.com';
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

  // Profile activity, from our own counter: this month for the table, and
  // the same 4 weeks as Google for the River.
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit' }).format(new Date());
  report.month = month;
  const all = await loadStats();
  const range = { view: 0, contacts: 0 };
  for (const [slug, days] of all) {
    const m = sumMonth(days, month);
    const actions = m.call + m.directions + m.website + m.quote;
    if (m.view || actions) report.businesses.push({ slug, ...m, actions });
    const rr = sumRange(days, report.range.start, report.range.end);
    range.view += rr.view; range.contacts += rr.call + rr.directions + rr.website + rr.quote;
  }
  report.businesses.sort((a: any, b: any) => b.actions - a.actions || b.view - a.view);
  report.rangeActivity = range;

  try {
    const q = await gscClient();
    if (q) {
      const r = report.range;
      const [cur, prev, queries, pages, prevPages, daily, devices] = await Promise.all([
        q({ startDate: r.start, endDate: r.end }),
        q({ startDate: daysAgo(58), endDate: daysAgo(31) }),
        q({ startDate: r.start, endDate: r.end, dimensions: ['query'], rowLimit: 1000 }),
        q({ startDate: r.start, endDate: r.end, dimensions: ['page'], rowLimit: 1000 }),
        q({ startDate: daysAgo(58), endDate: daysAgo(31), dimensions: ['page'], rowLimit: 1000 }),
        q({ startDate: daysAgo(92), endDate: r.end, dimensions: ['date'], rowLimit: 200 }),
        q({ startDate: r.start, endDate: r.end, dimensions: ['device'] }),
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
      const lastDay = daily.map((x) => x.keys![0]).sort().pop() || r.end;
      const q2 = queries.map((x) => ({ query: x.keys![0], clicks: x.clicks, impressions: x.impressions, ctr: round(x.ctr * 100), position: round(x.position) }));
      const p2 = pages.map((x) => { const p = pathOf(x.keys![0]); return { path: p, type: pageType(p), clicks: x.clicks, impressions: x.impressions, ctr: round(x.ctr * 100), position: round(x.position) }; });

      // Where Google sends people, by kind of page.
      const byType = new Map<string, { label: string; clicks: number; impressions: number }>();
      for (const p of p2) {
        const label = p.type === 'Category or page' ? 'Category pages' : p.type === 'Business' ? 'Business profiles' : p.type === 'Guide' ? 'Guides' : p.type === 'Home' ? 'Home page' : 'Other pages';
        const e = byType.get(label) || { label, clicks: 0, impressions: 0 };
        e.clicks += p.clicks; e.impressions += p.impressions; byType.set(label, e);
      }

      // Searches that already knew the name versus people discovering the site.
      const brandRe = /sioux\s*falls\s*go|siouxfallsgo/i;
      const brand = q2.filter((x) => brandRe.test(x.query)), other = q2.filter((x) => !brandRe.test(x.query));
      const sum = (a: any[], k: string) => a.reduce((s, x) => s + x[k], 0);

      // Average Google position for each industry: its category page, its
      // guides, and its business profiles together, weighted by times seen.
      const map: Record<string, string> = await fetch(`${SITE}/page-categories.json`).then((x) => (x.ok ? x.json() : {})).catch(() => ({}));
      const cats: any[] = await fetch(`${SITE}/category-index.json`).then((x) => (x.ok ? x.json() : [])).catch(() => []);
      const catName = Object.fromEntries(cats.map((c) => [c.slug, c.name]));
      const group = (rows: GscRow[]) => {
        const g = new Map<string, { clicks: number; impressions: number; posSum: number }>();
        for (const row of rows) {
          const cat = map[pathOf(row.keys![0]).replace(/\/$/, '') || '/'];
          if (!cat) continue;
          const e = g.get(cat) || { clicks: 0, impressions: 0, posSum: 0 };
          e.clicks += row.clicks; e.impressions += row.impressions; e.posSum += row.position * row.impressions;
          g.set(cat, e);
        }
        return g;
      };
      const gc = group(pages), gp = group(prevPages);
      const industries = [...gc.entries()].filter(([, e]) => e.impressions > 0).map(([slug, e]) => {
        const p = gp.get(slug);
        return {
          slug, name: catName[slug] || slug, clicks: e.clicks, impressions: e.impressions,
          position: round(e.posSum / e.impressions),
          previous: p && p.impressions ? round(p.posSum / p.impressions) : null,
        };
      }).sort((a, b) => b.impressions - a.impressions).slice(0, 15);

      report.gsc = {
        connected: true, dataThrough: lastDay,
        current: totals(cur), previous: totals(prev),
        weekly: [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)),
        queries: q2.slice(0, 30),
        pages: p2.slice(0, 30),
        pageTypes: [...byType.values()].sort((a, b) => b.clicks - a.clicks),
        devices: devices.map((x) => ({ label: ({ MOBILE: 'Phone', DESKTOP: 'Computer', TABLET: 'Tablet' } as any)[x.keys![0]] || x.keys![0], clicks: x.clicks, impressions: x.impressions })).sort((a, b) => b.clicks - a.clicks),
        discovery: { brandClicks: sum(brand, 'clicks'), otherClicks: sum(other, 'clicks'), brandImpressions: sum(brand, 'impressions'), otherImpressions: sum(other, 'impressions') },
        industries,
        // Seen often, on page one or close to it, but rarely clicked: a better
        // title and description is the fastest win.
        titleWins: p2.filter((p) => p.impressions >= 50 && p.position <= 12 && p.ctr < 2).sort((a, b) => b.impressions - a.impressions).slice(0, 10),
      };
    }
  } catch (err: any) {
    report.gsc = { connected: false, error: err?.message || String(err) };
  }

  await cache.setJSON('report', report);
  return json(report);
};

export const config = { path: '/api/site-analytics' };
