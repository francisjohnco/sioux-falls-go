import { getStore } from '@netlify/blobs';

// Counts what visitors do on a business profile: views, calls, directions,
// website visits, quote requests. Google does not report these, so we count
// them ourselves. One small record per business per month; no personal data.
//   POST { b: slug, a: 'view' | 'call' | 'directions' | 'website' | 'quote' }

const ACTIONS = ['view', 'call', 'directions', 'website', 'quote'];
const BOT = /bot|crawl|spider|slurp|preview|lighthouse|headless|facebookexternalhit|bingpreview/i;

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response(null, { status: 204 });
  if (BOT.test(req.headers.get('user-agent') || '')) return new Response(null, { status: 204 });
  const { b, a } = await req.json().catch(() => ({} as any));
  if (!/^[a-z0-9-]{2,80}$/.test(b || '') || !ACTIONS.includes(a)) return new Response(null, { status: 204 });
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit' }).format(new Date());
  const store = getStore('biz-stats');
  const key = `${b}/${month}`;
  const rec: Record<string, number> = ((await store.get(key, { type: 'json' })) as any) || {};
  rec[a] = (rec[a] || 0) + 1;
  await store.setJSON(key, rec);
  return new Response(null, { status: 204 });
};

export const config = {
  path: '/api/track',
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
