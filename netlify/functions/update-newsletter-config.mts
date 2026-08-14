// Lets the admin panel change the newsletter frequency. Writes to
// data/newsletter-config.json via GitHub's Contents API, same
// read-sha-then-write pattern as update-business.mts.

const GITHUB_API = 'https://api.github.com';
const VALID_FREQUENCIES = ['weekly', 'biweekly', 'monthly'];

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const cookieHeader = req.headers.get('cookie') || '';
  if (!cookieHeader.includes('sfg_admin_session=')) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  const { GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    return new Response(JSON.stringify({ error: 'GitHub env vars not configured' }), { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const frequency = body?.frequency;
  if (!VALID_FREQUENCIES.includes(frequency)) {
    return new Response(JSON.stringify({ error: `frequency must be one of: ${VALID_FREQUENCIES.join(', ')}` }), { status: 400 });
  }

  const headers = { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' };
  const path = 'data/newsletter-config.json';

  try {
    const getRes = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, { headers });
    const fileData = await getRes.json();
    const rawContent = Buffer.from(fileData.content, 'base64').toString('utf-8');

    let current;
    try {
      current = JSON.parse(rawContent);
    } catch (parseErr) {
      throw new Error(`data/newsletter-config.json is currently malformed on GitHub and needs a manual fix before this can save. Raw content: ${rawContent.slice(0, 200)}`);
    }
    current.frequency = frequency;

    // Sanity-check our own output before ever sending it to GitHub — this
    // guarantees we can never be the ones writing broken JSON, regardless
    // of what state the source file was in or what else touched it.
    const newContent = JSON.stringify(current, null, 2) + '\n';
    JSON.parse(newContent);

    const putRes = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Update newsletter frequency to ${frequency} [skip ci]`,
        content: Buffer.from(newContent).toString('base64'),
        sha: fileData.sha,
      }),
    });
    if (!putRes.ok) {
      const putError = await putRes.json().catch(() => ({}));
      throw new Error(`GitHub write failed: ${putRes.status}${putRes.status === 409 ? ' (someone else saved a change to this file at the same moment — try again)' : ''} ${putError.message || ''}`);
    }

    return new Response(JSON.stringify({ ok: true, frequency }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 500 });
  }
};

export const config = { path: '/api/update-newsletter-config' };
