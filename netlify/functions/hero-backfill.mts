import { getStore } from '@netlify/blobs';
import { makeToken } from './_shared/auth.mts';

// Hourly: starts the header photo finder while any article still needs a
// photo. Once everything has one, it only runs once a day to pick up new
// articles.
export default async () => {
  const status: any = (await getStore('hero-photos').get('status', { type: 'json' })) || {};
  const hoursSince = status.lastRun ? (Date.now() - Date.parse(status.lastRun)) / 3600000 : Infinity;
  if (status.remaining === 0 && status.categoriesRemaining === 0 && hoursSince < 23) return new Response('All articles have photos');
  if (status.error && hoursSince < 6) return new Response(`Waiting after error: ${status.error}`);

  const base = process.env.URL || 'https://siouxfallsgo.com';
  await fetch(`${base}/api/hero-backfill-background`, { method: 'POST', headers: { 'x-sfg-task': makeToken('hero-backfill', 1) } });
  return new Response('Started');
};

export const config = { schedule: '17 * * * *' };
