import { getStore } from '@netlify/blobs';
import { makeToken } from './_shared/auth.mts';

// Every two hours: writes the next few category pages until every category
// with businesses or guides has its own content, then checks once a day for
// new categories.
export default async () => {
  const s: any = (await getStore('category-content').get('status', { type: 'json' })) || {};
  const hours = s.lastRun ? (Date.now() - Date.parse(s.lastRun)) / 3600000 : Infinity;
  if (s.remaining === 0 && hours < 23) return new Response('Every category page is written');
  if (s.error && hours < 6) return new Response('Waiting after an error');
  const base = process.env.URL || 'https://siouxfallsgo.com';
  await fetch(`${base}/api/category-content-background`, { method: 'POST', headers: { 'x-sfg-task': makeToken('category-content', 1) } });
  return new Response('Started');
};

export const config = { schedule: '41 */2 * * *' };
