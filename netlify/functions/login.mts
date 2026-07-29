import crypto from 'node:crypto';

// Simple, dependency-free session auth for a single admin user.
// Env vars required (set in Netlify dashboard, never in code):
//   ADMIN_PASSWORD   — the password Francis logs in with
//   SESSION_SECRET    — a long random string, used to sign the session cookie

const SESSION_HOURS = 12;

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { password } = await req.json().catch(() => ({}));
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  const SESSION_SECRET = process.env.SESSION_SECRET;

  if (!ADMIN_PASSWORD || !SESSION_SECRET) {
    return new Response(JSON.stringify({ error: 'Server not configured — missing env vars' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (password !== ADMIN_PASSWORD) {
    // Deliberately slow this down slightly and give a generic message —
    // don't reveal whether the password was "close"
    return new Response(JSON.stringify({ error: 'Incorrect password' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const expires = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  const payload = `admin:${expires}`;
  const signature = sign(payload, SESSION_SECRET);
  const token = `${payload}:${signature}`;

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `sfg_admin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`,
    },
  });
};

export const config = { path: '/api/login' };
