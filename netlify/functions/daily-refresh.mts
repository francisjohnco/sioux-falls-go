import { triggerRefresh } from './_shared/refresh.mts';

// Runs every morning at 11:00 UTC (5 AM or 6 AM in Sioux Falls, depending on
// daylight saving). It rebuilds the site so anything dated for today goes
// live: scheduled articles, upcoming events, deal start and end dates.
export default async () => {
  try {
    await triggerRefresh('daily');
    console.log('Daily refresh triggered');
    return new Response('Daily refresh triggered', { status: 200 });
  } catch (err: any) {
    console.error('Daily refresh failed:', err?.message || err);
    return new Response('Daily refresh failed', { status: 500 });
  }
};

export const config = { schedule: '0 11 * * *' };
