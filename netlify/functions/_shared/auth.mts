import crypto from 'node:crypto';

// Signed session cookies. A token is "<prefix>:<subject...>:<expires>:<hmac>",
// signed with SESSION_SECRET. Checking only that a cookie EXISTS is not
// enough, anyone can create a cookie with any name, so every protected
// function verifies the signature and expiry here.

function hmac(value: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function readCookie(cookieHeader: string, name: string): string | null {
  const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function makeToken(payload: string, hours: number): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET not configured');
  const body = `${payload}:${Date.now() + hours * 3600 * 1000}`;
  return `${body}:${hmac(body, secret)}`;
}

// Returns the payload (everything before expiry) when the token is genuine and unexpired.
export function verifyToken(token: string | null): string | null {
  const secret = process.env.SESSION_SECRET;
  if (!token || !secret) return null;
  const i = token.lastIndexOf(':');
  if (i < 0) return null;
  const body = token.slice(0, i), sig = token.slice(i + 1);
  if (!safeEqual(sig, hmac(body, secret))) return null;
  const j = body.lastIndexOf(':');
  const expires = Number(body.slice(j + 1));
  if (!expires || Date.now() > expires) return null;
  return body.slice(0, j);
}

// Admin: matches the cookie the login function issues ("admin:<expires>:<sig>").
export function isAdmin(cookieHeader: string): boolean {
  return verifyToken(readCookie(cookieHeader || '', 'sfg_admin_session')) === 'admin';
}

// Business owner: "biz:<slug>:<expires>:<sig>". Returns the business slug.
export function businessFromCookie(cookieHeader: string): string | null {
  const payload = verifyToken(readCookie(cookieHeader || '', 'sfg_biz_session'));
  if (!payload || !payload.startsWith('biz:')) return null;
  const slug = payload.slice(4);
  return /^[a-z0-9-]+$/.test(slug) ? slug : null;
}

// Password hashing for business owner accounts (scrypt, built into Node).
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}
export function checkPassword(password: string, stored: string): boolean {
  const [salt, hash] = (stored || '').split(':');
  if (!salt || !hash) return false;
  return safeEqual(crypto.scryptSync(password, salt, 64).toString('hex'), hash);
}
export function randomToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}
export function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}
