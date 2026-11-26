import { getStore } from '@netlify/blobs';
import { readBusinessFile, readField } from './_shared/business-file.mts';
import { sendEmail } from './_shared/send-email.mts';
import { INTERVIEW_QUESTIONS } from '../../src/lib/interview-questions.ts';

// Public: the owner questions behind a private link (/verify/?c=<code>).
// Answering them is how a business becomes Verified. The code is made in
// the Outreach tab and only goes to the owner, so nobody can answer for a
// business they don't run.
//   GET  ?c=code → business name, the questions, and anything already answered
//   POST { c, contact: { phone, website, email }, answers: { id: text } }
// Answers land in the same store the admin Profile Interview uses, so the
// profile story can be written from them with one click.

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const REQUIRED = ['owner', 'local'];

async function slugFor(code: string): Promise<string | null> {
  if (!/^[a-z0-9]{6,20}$/.test(code)) return null;
  const slug = await getStore('outreach').get(`code-${code}`);
  return slug && /^[a-z0-9-]+$/.test(slug) ? slug : null;
}

export default async (req: Request) => {
  const url = new URL(req.url);
  const store = getStore('outreach');

  if (req.method === 'GET') {
    const slug = await slugFor(url.searchParams.get('c') || '');
    if (!slug) return json({ error: 'This link is not valid. Reply to the message you got and we will send a new one.' }, 404);
    let name = slug, phone = '', website = '';
    try {
      const f = await readBusinessFile(slug);
      name = readField(f.frontmatter, 'name') || slug;
      phone = readField(f.frontmatter, 'phone') || '';
      website = readField(f.frontmatter, 'website') || '';
    } catch { /* still show the questions */ }
    const saved: any = (await getStore('interview-answers').get(slug, { type: 'json' })) || { answers: {} };
    const records: any = (await store.get('records', { type: 'json' })) || {};
    const rec = records[slug] || {};
    return json({
      name, phone, website, email: rec.email || '',
      answered: !!rec.answeredAt,
      questions: INTERVIEW_QUESTIONS.map((q) => ({ ...q, required: REQUIRED.includes(q.id) })),
      answers: saved.answers || {},
    });
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const b: any = await req.json().catch(() => ({}));
  const slug = await slugFor(String(b.c || ''));
  if (!slug) return json({ error: 'This link is not valid.' }, 404);

  const records: any = (await store.get('records', { type: 'json' })) || {};
  const rec = records[slug] || {};
  rec.submissions = (rec.submissions || 0) + 1;
  if (rec.submissions > 25) return json({ error: 'Too many submissions on this link. Reply to our message and we will help.' }, 429);

  const clean: Record<string, string> = {};
  for (const q of INTERVIEW_QUESTIONS) {
    const v = b.answers?.[q.id];
    if (typeof v === 'string' && v.trim()) clean[q.id] = v.trim().slice(0, 4000);
  }
  const missing = REQUIRED.filter((id) => !clean[id]);
  if (missing.length) return json({ error: 'Please answer the questions marked required.', missing }, 400);

  const c = b.contact || {};
  const contact = {
    phone: String(c.phone || '').trim().slice(0, 40),
    website: String(c.website || '').trim().slice(0, 200),
    email: String(c.email || '').trim().slice(0, 200),
  };

  // Keep anything already gathered on a call; the owner's answers win where both exist.
  const answersStore = getStore('interview-answers');
  const prev: any = (await answersStore.get(slug, { type: 'json' })) || { answers: {} };
  await answersStore.setJSON(slug, { answers: { ...(prev.answers || {}), ...clean }, source: 'owner', updatedAt: new Date().toISOString() });

  rec.stage = rec.stage === 'verified' ? 'verified' : 'answered';
  rec.answeredAt = new Date().toISOString();
  rec.contact = contact;
  if (contact.email && !rec.email) rec.email = contact.email;
  rec.log = [...(rec.log || []), { at: rec.answeredAt, what: 'Owner answered the questions' }].slice(-40);
  rec.updatedAt = rec.answeredAt;
  records[slug] = rec;
  await store.setJSON('records', records);

  const notify = process.env.OUTREACH_REPLY_TO;
  if (notify) {
    const name = String(b.name || slug);
    const site = process.env.URL || 'https://siouxfallsgo.com';
    await sendEmail(notify.replace(/^.*<([^>]+)>.*$/, '$1'), `${name} answered the owner questions`,
      `${name} just answered the owner questions on Sioux Falls Go.\n\nOpen Outreach to review and verify them:\n${site}/admin?tab=outreach`).catch(() => {});
  }
  return json({ ok: true });
};

export const config = { path: '/api/owner-questions' };
