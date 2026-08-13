// Manual "Generate Newsletter Now" trigger from the admin panel. Requires
// a valid admin session cookie — same auth check as every other admin
// function on this site.

import { generateAndDraftNewsletter } from './_shared/newsletter-generator.mts';

const GITHUB_API = 'https://api.github.com';

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const cookieHeader = req.headers.get('cookie') || '';
  if (!cookieHeader.includes('sfg_admin_session=')) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  const { GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN } = process.env;
  let lastGeneratedAt: string | null = null;
  try {
    const res = await fetch(
      `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/newsletter-config.json`,
      { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' } }
    );
    const data = await res.json();
    const config = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));
    lastGeneratedAt = config.lastGeneratedAt;
  } catch {
    // If we can't read the config, proceed with no "since" filter rather than fail outright
  }

  const result = await generateAndDraftNewsletter(lastGeneratedAt);

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = { path: '/api/generate-newsletter' };
