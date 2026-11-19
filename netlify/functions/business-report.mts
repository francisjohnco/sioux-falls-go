import { getStore } from '@netlify/blobs';
import { isAdmin, businessFromCookie } from './_shared/auth.mts';
import { readBusinessFile, readField } from './_shared/business-file.mts';
import { readText } from './_shared/git-batch.mts';
import { gscClient, daysAgo, type GscRow } from './_shared/gsc.mts';
import { loadStats, sumMonth } from './_shared/stats.mts';

// One business's report: how people find it on Google through Sioux Falls Go
// (its own profile, plus its category page and the guides in its industry),
// and what they do once they land (calls, directions, website, quotes).
//   GET ?b=slug   (admin: any business; owners: their own, ?b= optional)
// Cached for six hours so it stays fast and gentle on Google's quota.

const SITE = 'https://siouxfallsgo.com';
const CACHE_HOURS = 6;
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
type Totals = { clicks: number; impressions: number; position: number };

function total(rows: GscRow[]): Totals {
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  const position = impressions ? rows.reduce((s, r) => s + r.position * r.impressions, 0) / impressions : 0;
  return { clicks, impressions, position: Math.round(position * 10) / 10 };
}

function monthKeys(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 15));
    out.push(m.toISOString().slice(0, 7));
  }
  return out;
}

export default async (req: Request) => {
  const cookie = req.headers.get('cookie') || '';
  const asked = new URL(req.url).searchParams.get('b') || '';
  const owner = businessFromCookie(cookie);
  const admin = isAdmin(cookie);
  const slug = admin && asked ? asked : owner;
  if (!slug || (!admin && asked && asked !== owner)) return json({ error: 'Please sign in to see your report.' }, 401);
  if (!/^[a-z0-9-]+$/.test(slug)) return json({ error: 'Invalid business' }, 400);

  const cache = getStore('biz-reports');
  const fresh = new URL(req.url).searchParams.get('refresh') === '1' && admin;
  const cached: any = fresh ? null : await cache.get(slug, { type: 'json' });
  if (cached && Date.now() - Date.parse(cached.generatedAt) < CACHE_HOURS * 3600000) return json(cached);

  let f;
  try { f = await readBusinessFile(slug); } catch { return json({ error: 'That business was not found.' }, 404); }
  const name = readField(f.frontmatter, 'name') || slug;
  const category = readField(f.frontmatter, 'category') || '';
  const catRaw = category ? await readText(`src/content/categories/${category}.json`).catch(() => null) : null;
  const categoryName = catRaw ? JSON.parse(catRaw).name : category;
  const articles: any[] = await fetch(`${SITE}/article-index.json`).then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const guides = articles.filter((a) => a.category === category && a.live !== false).map((a) => a.slug);

  const profileRe = new RegExp(`/businesses/${esc(slug)}/?$`);
  const isProfile = (page: string) => profileRe.test(page.replace(/[?#].*$/, ''));
  const pattern = [`/businesses/${esc(slug)}/?$`, category ? `/${esc(category)}/?$` : '', guides.length ? `/guides/(${guides.map(esc).join('|')})/?$` : ''].filter(Boolean).join('|');
  const filter = [{ filters: [{ dimension: 'page', operator: 'includingRegex', expression: pattern }] }];

  const report: any = {
    generatedAt: new Date().toISOString(),
    business: { slug, name, category, categoryName, guides: guides.length },
    range: { start: daysAgo(30), end: daysAgo(2), prevStart: daysAgo(58), prevEnd: daysAgo(31) },
    gsc: { connected: false },
    actions: [],
    insights: [] as string[],
  };

  // What people did on the profile, from our own counter.
  const days = (await loadStats(`${slug}/`)).get(slug);
  for (const m of monthKeys(3)) report.actions.push({ month: m, ...sumMonth(days, m) });

  try {
    const q = await gscClient();
    if (q) {
      const [cur, prev, queries, daily] = await Promise.all([
        q({ startDate: report.range.start, endDate: report.range.end, dimensions: ['page'], dimensionFilterGroups: filter, rowLimit: 500 }),
        q({ startDate: report.range.prevStart, endDate: report.range.prevEnd, dimensions: ['page'], dimensionFilterGroups: filter, rowLimit: 500 }),
        q({ startDate: daysAgo(92), endDate: report.range.end, dimensions: ['query', 'page'], dimensionFilterGroups: filter, rowLimit: 500 }),
        q({ startDate: daysAgo(92), endDate: report.range.end, dimensions: ['date', 'page'], dimensionFilterGroups: filter, rowLimit: 5000 }),
      ]);
      const split = (rows: GscRow[]) => ({ profile: total(rows.filter((r) => isProfile(r.keys![0]))), industry: total(rows.filter((r) => !isProfile(r.keys![0]))) });
      const c = split(cur), p = split(prev);

      // Merge query rows across pages so each search shows once.
      const byQuery = new Map<string, { query: string; clicks: number; impressions: number; posSum: number; profile: boolean }>();
      for (const r of queries) {
        const [query, page] = r.keys!;
        const e = byQuery.get(query) || { query, clicks: 0, impressions: 0, posSum: 0, profile: false };
        e.clicks += r.clicks; e.impressions += r.impressions; e.posSum += r.position * r.impressions;
        if (isProfile(page)) e.profile = true;
        byQuery.set(query, e);
      }
      const topQueries = [...byQuery.values()]
        .map((e) => ({ query: e.query, clicks: e.clicks, impressions: e.impressions, position: e.impressions ? Math.round((e.posSum / e.impressions) * 10) / 10 : 0, profile: e.profile }))
        .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks)
        .slice(0, 25);

      // Weekly trend (Monday weeks) for the chart.
      const weeks = new Map<string, { week: string; profileClicks: number; industryClicks: number; impressions: number }>();
      for (const r of daily) {
        const [date, page] = r.keys!;
        const d = new Date(`${date}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
        const wk = d.toISOString().slice(0, 10);
        const w = weeks.get(wk) || { week: wk, profileClicks: 0, industryClicks: 0, impressions: 0 };
        if (isProfile(page)) w.profileClicks += r.clicks; else w.industryClicks += r.clicks;
        w.impressions += r.impressions;
        weeks.set(wk, w);
      }
      report.gsc = { connected: true, current: c, previous: p, queries: topQueries, weekly: [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)) };

      // Plain-language takeaways, only from the numbers above.
      const ins: string[] = report.insights;
      const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null);
      const shown = c.profile.impressions + c.industry.impressions;
      if (shown) ins.push(`Over the last 4 weeks, Google showed Sioux Falls Go pages that feature ${name} ${shown.toLocaleString()} times in search results.`);
      const ch = pct(c.profile.clicks, p.profile.clicks);
      if (c.profile.clicks) ins.push(`${c.profile.clicks.toLocaleString()} people clicked from Google straight to your profile${ch !== null ? `, ${ch >= 0 ? 'up' : 'down'} ${Math.abs(ch)}% from the 4 weeks before` : ''}.`);
      const nameWord = name.toLowerCase().split(/\s+/)[0];
      const brand = topQueries.filter((t) => t.query.includes(nameWord));
      if (brand.length) ins.push(`People searching for you by name also see your Sioux Falls Go profile, for example "${brand[0].query}".`);
      const service = topQueries.find((t) => !t.query.includes(nameWord) && t.impressions >= 10);
      if (service) ins.push(`The search "${service.query}" brought ${service.impressions.toLocaleString()} views to pages where you are listed. These are customers looking for what you do, not for a company they already know.`);
      const close = topQueries.find((t) => t.impressions >= 20 && t.position > 4 && t.position <= 15);
      if (close) ins.push(`"${close.query}" sits at position ${close.position} on Google. Moving onto the first few results is where most of the clicks are, and a new guide or updated profile is the usual way to get there.`);
    }
  } catch (err: any) {
    report.gsc = { connected: false, error: err?.message || String(err) };
  }

  const acts = report.actions[0];
  const contacts = acts.call + acts.directions + acts.website + acts.quote;
  if (contacts) report.insights.push(`This month so far, ${contacts} visitor${contacts === 1 ? '' : 's'} called, asked for directions, visited your website, or requested a quote from your profile.`);

  await cache.setJSON(slug, report);
  return json(report);
};

export const config = { path: '/api/business-report' };
