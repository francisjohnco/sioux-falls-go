import { getStore } from '@netlify/blobs';
import { isAdmin } from './_shared/auth.mts';

export default async (req: Request) => {
  const cookieHeader = req.headers.get('cookie') || '';
  if (!isAdmin(cookieHeader)) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  const url = new URL(req.url);
  const jobId = url.searchParams.get('jobId');
  if (!jobId) {
    return new Response(JSON.stringify({ error: 'Missing jobId' }), { status: 400 });
  }

  const store = getStore('draft-jobs');
  const job = await store.get(jobId, { type: 'json' });

  if (!job) {
    return new Response(JSON.stringify({ status: 'not-found' }), { status: 404 });
  }

  return new Response(JSON.stringify(job), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = { path: '/api/check-draft-status' };
