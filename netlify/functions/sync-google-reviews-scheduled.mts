// Runs automatically every Monday. See _shared/google-reviews-sync.mts for
// the actual logic — this file exists only because Netlify does not allow
// a scheduled function to also declare an HTTP path (see
// sync-google-reviews.mts for the on-demand version of the same sync).

import { syncAllBusinesses } from './_shared/google-reviews-sync.mts';

export default async () => {
  try {
    const { summary } = await syncAllBusinesses();
    return new Response(`Review sync complete: ${JSON.stringify(summary)}`, { status: 200 });
  } catch (err: any) {
    console.error('Scheduled review sync failed:', err);
    return new Response(String(err?.message || err), { status: 500 });
  }
};

export const config = {
  schedule: '0 8 * * 1', // 8am UTC every Monday — weekly refresh, matches Google's own ToS expectation to keep review content current
};
