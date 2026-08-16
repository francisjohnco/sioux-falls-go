import { getStore } from '@netlify/blobs';
import { runDraftGeneration } from './_shared/draft-generator.mts';

export default async (req: Request) => {
  const body = await req.json().catch(() => null);
  const jobId = body?.jobId;
  if (!jobId) return new Response('Missing jobId', { status: 400 });

  const store = getStore('draft-jobs');

  try {
    const draft = await runDraftGeneration(body);
    await store.setJSON(jobId, { status: 'complete', draft, completedAt: new Date().toISOString() });
  } catch (err: any) {
    await store.setJSON(jobId, { status: 'error', error: String(err?.message || err) });
  }

  // Background functions don't need to return anything meaningful to the
  // caller — the caller already got its 202 and moved on to polling.
  return new Response('ok');
};

export const config = { path: '/api/generate-draft-background', background: true };
