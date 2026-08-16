import crypto from 'node:crypto';

// Host authentication, separate from the admin login (different cookie
// name, different credential source). Each stay has its own hostEmail +
// hostAccessCode, set directly in that stay's content file — no shared
// password, no separate user database, reusing the same GitHub-as-CMS
// pattern already used everywhere else in this project.
//
// Env vars required: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, SESSION_SECRET

const SESSION_HOURS = 24 * 30; // hosts stay logged in for a month, not 12 hours like the admin session

function sign(value: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function parseFrontmatter(raw: string): Record<string, string> {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fields: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const fieldMatch = line.match(/^(\w+):\s*"?(.*?)"?\s*$/);
    if (fieldMatch) fields[fieldMatch[1]] = fieldMatch[2];
  }
  return fields;
}

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const { email, accessCode } = await req.json().catch(() => ({}));
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, SESSION_SECRET } = process.env;

  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO || !SESSION_SECRET) {
    return new Response(JSON.stringify({ error: 'Server not configured — missing env vars' }), { status: 500 });
  }
  if (!email || !accessCode) {
    return new Response(JSON.stringify({ error: 'Email and access code are both required' }), { status: 400 });
  }

  try {
    const listRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/src/content/stays`,
      { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' } }
    );
    const files: { name: string; path: string }[] = await listRes.json();

    let matchedSlug: string | null = null;
    for (const file of files.filter((f) => f.name.endsWith('.md'))) {
      const contentRes = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${file.path}`,
        { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' } }
      );
      const data = await contentRes.json();
      const raw = Buffer.from(data.content, 'base64').toString('utf-8');
      const fields = parseFrontmatter(raw);

      if (fields.hostEmail?.toLowerCase() === email.toLowerCase() && fields.hostAccessCode === accessCode) {
        matchedSlug = file.name.replace(/\.md$/, '');
        break;
      }
    }

    if (!matchedSlug) {
      // Deliberately generic — don't reveal whether the email or the code was the wrong part
      return new Response(JSON.stringify({ error: 'Email or access code not recognized' }), { status: 401 });
    }

    const expires = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
    const payload = `${matchedSlug}:${expires}`;
    const signature = sign(payload, SESSION_SECRET);
    const token = `${payload}:${signature}`;

    return new Response(JSON.stringify({ ok: true, slug: matchedSlug }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `sfg_host_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`,
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Login failed', detail: String(err?.message || err) }), { status: 500 });
  }
};

export const config = { path: '/api/host-login' };
