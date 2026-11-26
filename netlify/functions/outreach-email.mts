import { getStore } from '@netlify/blobs';
import { isAdmin } from './_shared/auth.mts';
import { sendEmail, emailConfigured } from './_shared/send-email.mts';

// Admin: send an outreach email to a business owner straight from the
// Outreach tab, and log it as a touch.
//   GET  → { configured } so the tab knows whether to show "Send" or fall back to the mail app
//   POST { slug, to, subject, body }

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async (req: Request) => {
  if (!isAdmin(req.headers.get('cookie') || '')) return json({ error: 'Not authenticated' }, 401);
  if (req.method === 'GET') return json({ configured: emailConfigured() });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const b: any = await req.json().catch(() => ({}));
  const slug = String(b.slug || '');
  const to = String(b.to || '').trim();
  const subject = String(b.subject || '').trim().slice(0, 200);
  const body = String(b.body || '').slice(0, 10000);
  if (!/^[a-z0-9-]+$/.test(slug)) return json({ error: 'Missing business' }, 400);
  if (!EMAIL.test(to)) return json({ error: 'Add the owner\'s email address first.' }, 400);
  if (!subject || !body) return json({ error: 'The email needs a subject and a message.' }, 400);

  const sent = await sendEmail(to, subject, body);
  if (sent.notConfigured) return json({ error: 'Email sending is not set up yet.', notConfigured: true }, 501);
  if (!sent.ok) return json({ error: sent.error || 'Could not send' }, 502);

  const store = getStore('outreach');
  const records: any = (await store.get('records', { type: 'json' })) || {};
  const rec = records[slug] || {};
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  d.setDate(d.getDate() + 3);
  rec.email = to;
  rec.touches = (rec.touches || 0) + 1;
  if (!rec.stage || rec.stage === 'contacted') rec.stage = 'contacted';
  rec.nextAt = d.toISOString().slice(0, 10);
  rec.log = [...(rec.log || []), { at: new Date().toISOString(), what: `Emailed: ${subject}` }].slice(-40);
  rec.updatedAt = new Date().toISOString();
  records[slug] = rec;
  await store.setJSON('records', records);
  return json({ ok: true, record: rec });
};

export const config = { path: '/api/outreach-email' };
