import { getStore } from '@netlify/blobs';

// Profile visit and tap counts. Stored one record per business per day
// ("slug/2026-11-19"); the first two days were stored per month
// ("slug/2026-11") and are still read.
export type Rec = { view?: number; call?: number; directions?: number; website?: number; quote?: number };
export const KEYS = ['view', 'call', 'directions', 'website', 'quote'] as const;

export async function loadStats(prefix = ''): Promise<Map<string, Map<string, Rec>>> {
  const store = getStore('biz-stats');
  const { blobs } = await store.list(prefix ? { prefix } : undefined);
  const out = new Map<string, Map<string, Rec>>();
  await Promise.all(blobs.map(async (b) => {
    const [slug, period] = b.key.split('/');
    if (!slug || !period) return;
    const rec = ((await store.get(b.key, { type: 'json' })) as Rec) || {};
    if (!out.has(slug)) out.set(slug, new Map());
    out.get(slug)!.set(period, rec);
  }));
  return out;
}

const add = (t: Required<Rec>, r: Rec) => { for (const k of KEYS) t[k] += r[k] || 0; return t; };
const zero = (): Required<Rec> => ({ view: 0, call: 0, directions: 0, website: 0, quote: 0 });

// Totals for a date range (YYYY-MM-DD). An old monthly record counts when its month overlaps the range.
export function sumRange(days: Map<string, Rec> | undefined, start: string, end: string) {
  const t = zero();
  for (const [p, r] of days || []) {
    const inRange = p.length === 10 ? p >= start && p <= end : `${p}-31` >= start && `${p}-01` <= end;
    if (inRange) add(t, r);
  }
  return t;
}

export function sumMonth(days: Map<string, Rec> | undefined, month: string) {
  const t = zero();
  for (const [p, r] of days || []) if (p.slice(0, 7) === month) add(t, r);
  return t;
}

export const chicagoDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
