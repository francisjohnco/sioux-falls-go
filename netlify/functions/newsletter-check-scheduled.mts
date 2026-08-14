// Runs daily. Reads the admin-configured frequency from
// data/newsletter-config.json and only actually generates a newsletter
// once enough time has genuinely passed since the last one — the schedule
// below is fixed (Netlify requires that), but the effective cadence is
// controlled entirely by what's set in the admin panel, checked fresh
// every time this runs.

import { generateAndDraftNewsletter } from '../shared/newsletter-generator.mts';

const GITHUB_API = 'https://api.github.com';

const FREQUENCY_DAYS: Record<string, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

export default async () => {
  const { GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN } = process.env;

  const res = await fetch(
    `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/newsletter-config.json`,
    { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' } }
  );
  if (!res.ok) {
    console.error('newsletter-check: could not read config, skipping run');
    return new Response('config read failed', { status: 500 });
  }
  const data = await res.json();
  const config = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));

  const frequencyDays = FREQUENCY_DAYS[config.frequency] ?? 7;
  const lastGeneratedAt: string | null = config.lastGeneratedAt;

  if (lastGeneratedAt) {
    const daysSince = (Date.now() - new Date(lastGeneratedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < frequencyDays) {
      return new Response(
        JSON.stringify({ skipped: true, reason: `Only ${daysSince.toFixed(1)} of ${frequencyDays} days elapsed` }),
        { status: 200 }
      );
    }
  }

  const result = await generateAndDraftNewsletter(lastGeneratedAt);
  return new Response(JSON.stringify(result), { status: result.ok ? 200 : 500 });
};

export const config = { schedule: '0 13 * * *' }; // every day at 13:00 UTC (8am Central)
