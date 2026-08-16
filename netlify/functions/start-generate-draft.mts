import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const cookieHeader = req.headers.get('cookie') || '';
  if (!cookieHeader.includes('sfg_admin_session=')) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }

  const jobId = crypto.randomBytes(12).toString('hex');
  const store = getStore('draft-jobs');
  await store.setJSON(jobId, { status: 'pending', createdAt: new Date().toISOString() });

  // Fire the background worker — Netlify treats any function whose
  // filename ends in "-background" specially: this request returns
  // immediately (202) while the worker keeps running for up to 15
  // minutes, well clear of the 10-second synchronous function limit
  // that was very likely causing the original timeout failures.
  const siteUrl = process.env.URL || process.env.DEPLOY_URL;
  const bgRes = await fetch(`${siteUrl}/api/generate-draft-background`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId, ...body }),
  });

  if (!bgRes.ok && bgRes.status !== 202) {
    // The dispatch itself failed (not the generation) — surface this clearly
    // rather than leaving the client polling a job that never started.
    await store.setJSON(jobId, { status: 'error', error: `Failed to start background job: HTTP ${bgRes.status}` });
  }

  return new Response(JSON.stringify({ jobId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = { path: '/api/start-generate-draft' };
