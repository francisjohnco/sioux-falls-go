import { getStore } from '@netlify/blobs';
import { randomToken } from './_shared/auth.mts';
import { cleanRedeem } from './_shared/deal-redeem.mts';

// Public: any business can send a Black Friday deal from /local-deals/black-friday/.
// Nothing goes live until it is approved in Admin.

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const TYPES = ['percent-off', 'dollar-off', 'bogo', 'free-item', 'bundle', 'other'];
const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const b = await req.json().catch(() => ({}));
  if (b.website_url) return json({ ok: true }); // honeypot: bots fill every field

  const d: Record<string, any> = {
    businessSlug: /^[a-z0-9-]{1,80}$/.test(b.businessSlug || '') ? b.businessSlug : '',
    businessName: clean(b.businessName, 120),
    contactName: clean(b.contactName, 80),
    email: clean(b.email, 120).toLowerCase(),
    phone: clean(b.phone, 30),
    title: clean(b.title, 80),
    description: clean(b.description, 300),
    discountType: TYPES.includes(b.discountType) ? b.discountType : 'other',
    startsAt: clean(b.startsAt, 10),
    endsAt: clean(b.endsAt, 10),
    terms: clean(b.terms, 200),
    promotion: 'black-friday',
  };

  if (!d.businessName) return json({ error: 'Enter your business name.' }, 400);
  if (!d.contactName) return json({ error: 'Enter your name.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return json({ error: 'Enter an email we can reach you at.' }, 400);
  if (d.title.length < 4) return json({ error: 'Give your deal a short title, like 25% Off Everything.' }, 400);
  if (d.description.length < 10) return json({ error: 'Add a sentence describing the deal.' }, 400);
  if ((d.startsAt && !isDate(d.startsAt)) || (d.endsAt && !isDate(d.endsAt))) return json({ error: 'Use valid dates.' }, 400);
  if (d.startsAt && d.endsAt && d.endsAt < d.startsAt) return json({ error: 'The end date is before the start date.' }, 400);

  const redeem = cleanRedeem(b);
  if ('error' in redeem) return json({ error: redeem.error }, 400);
  Object.assign(d, redeem);

  const store = getStore('deal-submissions');
  const { blobs } = await store.list();
  if (blobs.length > 300) return json({ error: 'We are getting a lot of submissions right now. Please email us your deal instead.' }, 429);
  const id = `${Date.now().toString(36)}-${randomToken().slice(0, 6)}`;
  await store.setJSON(id, { id, ...d, submittedAt: new Date().toISOString(), ip: req.headers.get('x-nf-client-connection-ip') || '' });
  return json({ ok: true, message: 'Thanks! We will review your deal and it will appear on the Black Friday page once approved, usually within a day.' });
};

export const config = { path: '/api/deal-submit', rateLimit: { windowLimit: 5, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
