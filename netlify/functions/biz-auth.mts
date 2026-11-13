import { getStore } from '@netlify/blobs';
import { makeToken, hashPassword, checkPassword, sha256 } from './_shared/auth.mts';

// Business owner sign-in for premium (Community Champion) listings.
//   accept: first visit from the invite link you sent. The owner picks a password.
//   login:  email and password.
//   logout: clears the session.
// Accounts live in Netlify Blobs ("business-accounts"), keyed by business slug.
// Passwords are hashed with scrypt; the invite token is stored only as a hash.

const SESSION_HOURS = 24 * 14;
const json = (obj: unknown, status = 200, cookie?: string) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...(cookie ? { 'Set-Cookie': cookie } : {}) } });
const sessionCookie = (slug: string) =>
  `sfg_biz_session=${encodeURIComponent(makeToken(`biz:${slug}`, SESSION_HOURS))}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}`;

export default async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!process.env.SESSION_SECRET) return json({ error: 'Sign-in is not configured on the server' }, 500);
  const body = await req.json().catch(() => ({}));
  const store = getStore('business-accounts');

  if (body.action === 'logout') {
    return json({ ok: true }, 200, 'sfg_biz_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  }

  if (body.action === 'accept') {
    const slug = String(body.slug || '');
    if (!/^[a-z0-9-]+$/.test(slug)) return json({ error: 'This link is not valid.' }, 400);
    const acct: any = await store.get(slug, { type: 'json' });
    if (!acct?.inviteHash || acct.inviteHash !== sha256(String(body.invite || '')) || Date.now() > acct.inviteExpires) {
      return json({ error: 'This link has expired or was already used. Ask Sioux Falls Go for a new one.' }, 400);
    }
    const password = String(body.password || '');
    if (password.length < 10) return json({ error: 'Use at least 10 characters for your password.' }, 400);
    acct.passwordHash = hashPassword(password);
    delete acct.inviteHash; delete acct.inviteExpires;
    acct.activatedAt = acct.activatedAt || new Date().toISOString();
    acct.lastLoginAt = new Date().toISOString();
    await store.setJSON(slug, acct);
    return json({ ok: true, slug }, 200, sessionCookie(slug));
  }

  if (body.action === 'login') {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const fail = () => json({ error: 'That email and password do not match an account.' }, 401);
    if (!email || !password) return fail();
    const { blobs } = await store.list();
    for (const { key } of blobs) {
      const acct: any = await store.get(key, { type: 'json' });
      if (acct?.email?.toLowerCase() === email && acct.passwordHash && checkPassword(password, acct.passwordHash)) {
        acct.lastLoginAt = new Date().toISOString();
        await store.setJSON(key, acct);
        return json({ ok: true, slug: key }, 200, sessionCookie(key));
      }
    }
    return fail();
  }

  return json({ error: 'Unknown action' }, 400);
};

export const config = {
  path: '/api/biz-auth',
  // Slows down password guessing: 10 attempts per minute per visitor.
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
