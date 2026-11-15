import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
import { isAdmin, makeToken } from './_shared/auth.mts';

// Admin: profile interviews.
//   GET ?slug=x            saved answers for a business
//   GET ?job=id            status of a profile being written
//   POST { action: 'save', slug, answers }
//   POST { action: 'write', slug, useCurrent }   writes the profile in the background

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

export default async (req: Request) => {
  if (!isAdmin(req.headers.get('cookie') || '')) return json({ error: 'Not authenticated' }, 401);
  const answers = getStore('interview-answers');
  const jobs = getStore('profile-jobs');
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const job = url.searchParams.get('job');
    if (job) return json((await jobs.get(job, { type: 'json' })) || { status: 'missing' });
    const slug = url.searchParams.get('slug') || '';
    if (!/^[a-z0-9-]+$/.test(slug)) return json({ error: 'Invalid business' }, 400);
    return json((await answers.get(slug, { type: 'json' })) || { answers: {} });
  }

  const b = await req.json().catch(() => ({}));
  const slug = String(b.slug || '');
  if (!/^[a-z0-9-]+$/.test(slug)) return json({ error: 'Choose a business first.' }, 400);

  if (b.action === 'save') {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(b.answers || {})) if (/^[a-z0-9]+$/.test(k) && typeof v === 'string') clean[k] = v.slice(0, 4000);
    await answers.setJSON(slug, { answers: clean, updatedAt: new Date().toISOString() });
    return json({ ok: true });
  }

  if (b.action === 'write') {
    const jobId = crypto.randomBytes(10).toString('hex');
    await jobs.setJSON(jobId, { status: 'pending', slug, createdAt: new Date().toISOString() });
    const base = process.env.URL || 'https://siouxfallsgo.com';
    const r = await fetch(`${base}/api/profile-write-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sfg-task': makeToken('profile-job', 1) },
      body: JSON.stringify({ jobId, slug, useCurrent: !!b.useCurrent }),
    });
    if (!r.ok && r.status !== 202) await jobs.setJSON(jobId, { status: 'error', error: `Could not start writing (HTTP ${r.status}).` });
    return json({ ok: true, jobId });
  }

  return json({ error: 'Unknown action' }, 400);
};

export const config = { path: '/api/profile-interview' };
