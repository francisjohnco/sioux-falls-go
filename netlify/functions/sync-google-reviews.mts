// On-demand version, called by the admin dashboard's "Sync Reviews Now"
// button. See _shared/google-reviews-sync.mts for the actual logic — this
// file exists only because Netlify does not allow an HTTP-path function to
// also declare a schedule (see sync-google-reviews-scheduled.mts for the
// automatic weekly version of the same sync).

import { syncAllBusinesses } from './_shared/google-reviews-sync.mts';

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const cookieHeader = req.headers.get('cookie') || '';
  if (!cookieHeader.includes('sfg_admin_session=')) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  try {
    const { summary, results } = await syncAllBusinesses();
    return new Response(JSON.stringify({ ok: true, summary, results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config = { path: '/api/sync-google-reviews' };
