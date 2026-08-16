import crypto from 'node:crypto';

function sign(value: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

export default async (req: Request) => {
  const cookieHeader = req.headers.get('cookie') || '';
  const match = cookieHeader.match(/sfg_host_session=([^;]+)/);
  const SESSION_SECRET = process.env.SESSION_SECRET;

  if (!match || !SESSION_SECRET) {
    return new Response(JSON.stringify({ authenticated: false }), { status: 401 });
  }

  const token = decodeURIComponent(match[1]);
  const parts = token.split(':');
  if (parts.length !== 3) {
    return new Response(JSON.stringify({ authenticated: false }), { status: 401 });
  }
  const [slug, expires, signature] = parts;
  const expectedSignature = sign(`${slug}:${expires}`, SESSION_SECRET);

  if (signature !== expectedSignature || Date.now() > Number(expires)) {
    return new Response(JSON.stringify({ authenticated: false }), { status: 401 });
  }

  return new Response(JSON.stringify({ authenticated: true, slug }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = { path: '/api/host-session-check' };
