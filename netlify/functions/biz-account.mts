import { getStore } from '@netlify/blobs';
import { isAdmin, randomToken, sha256 } from './_shared/auth.mts';
import { readBusinessFile, readField } from './_shared/business-file.mts';

// Admin only. Creates a sign-in link for a premium business owner, lists who
// has access, and revokes access. Creating a new link for an existing account
// also works as a password reset.

const INVITE_DAYS = 7;
const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

export default async (req: Request) => {
  if (!isAdmin(req.headers.get('cookie') || '')) return json({ error: 'Not authenticated' }, 401);
  const store = getStore('business-accounts');

  if (req.method === 'GET') {
    const { blobs } = await store.list();
    const accounts = await Promise.all(blobs.map(async ({ key }) => {
      const a: any = await store.get(key, { type: 'json' });
      return {
        slug: key, email: a?.email,
        status: a?.passwordHash ? 'active' : a?.inviteHash && Date.now() < a.inviteExpires ? 'invited' : 'expired',
        activatedAt: a?.activatedAt, lastLoginAt: a?.lastLoginAt,
      };
    }));
    return json({ accounts });
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const body = await req.json().catch(() => ({}));
  const slug = String(body.slug || '');
  if (!/^[a-z0-9-]+$/.test(slug)) return json({ error: 'Invalid business' }, 400);

  if (body.action === 'revoke') {
    await store.delete(slug);
    return json({ ok: true });
  }

  if (body.action === 'invite') {
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Enter the owner\'s email address.' }, 400);
    let tier: string | undefined;
    try { tier = readField((await readBusinessFile(slug)).frontmatter, 'partnershipTier'); } catch (err: any) { return json({ error: err.message }, 502); }
    if (tier !== 'community-champion') return json({ error: 'Owner sign-in is for Community Champion listings. Upgrade this business first.' }, 400);

    const others = (await store.list()).blobs.filter((b) => b.key !== slug);
    for (const { key } of others) {
      const a: any = await store.get(key, { type: 'json' });
      if (a?.email?.toLowerCase() === email) return json({ error: `That email already signs in for another business (${key}). Each business needs its own email.` }, 409);
    }

    const existing: any = (await store.get(slug, { type: 'json' })) || {};
    const token = randomToken();
    await store.setJSON(slug, {
      ...existing,
      email,
      inviteHash: sha256(token),
      inviteExpires: Date.now() + INVITE_DAYS * 86400e3,
      invitedAt: new Date().toISOString(),
      createdAt: existing.createdAt || new Date().toISOString(),
    });
    const site = (process.env.URL || 'https://siouxfallsgo.com').replace(/\/$/, '');
    return json({ ok: true, link: `${site}/business-login/?b=${slug}&invite=${token}`, expiresInDays: INVITE_DAYS });
  }

  return json({ error: 'Unknown action' }, 400);
};

export const config = { path: '/api/biz-account' };
