// Runs on Deno at the edge — intercepts every /admin/* request before the
// static page is served. This is what actually makes /admin private; the
// login function alone only issues the cookie, this is what enforces it.

export default async (request: Request, context: any) => {
  const url = new URL(request.url);

  // Never gate the login page itself, or we'd create a redirect loop
  if (url.pathname === '/login') {
    return context.next();
  }

  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/sfg_admin_session=([^;]+)/);
  const token = match ? decodeURIComponent(match[1]) : null;

  if (!token || !(await isValidSession(token))) {
    return Response.redirect(new URL('/login', url.origin), 302);
  }

  return context.next();
};

async function isValidSession(token: string): Promise<boolean> {
  const SESSION_SECRET = Netlify.env.get('SESSION_SECRET');
  if (!SESSION_SECRET) return false;

  const parts = token.split(':');
  if (parts.length !== 3) return false;
  const [prefix, expiresStr, signature] = parts;
  if (prefix !== 'admin') return false;

  const expires = Number(expiresStr);
  if (!expires || Date.now() > expires) return false; // expired session

  const payload = `${prefix}:${expiresStr}`;
  const expectedSig = await hmacSha256Hex(payload, SESSION_SECRET);
  return timingSafeEqual(signature, expectedSig);
}

async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export const config = { path: '/admin/*' };
