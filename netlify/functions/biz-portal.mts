import { getStore } from '@netlify/blobs';
import { businessFromCookie } from './_shared/auth.mts';
import {
  readBusinessFile, writeBusinessFile, readField, readList, readHours, applyChanges, putFile, getFile, deleteFile, listDir,
  OWNER_INSTANT_FIELDS, OWNER_REVIEW_FIELDS,
} from './_shared/business-file.mts';

// Everything a signed-in business owner can do. The business comes from the
// signed session cookie, never from the request, so an owner can only ever
// touch their own listing.
//
//   GET                      their current profile, specials, and any change waiting for review
//   POST save                contact info, hours, coupon style: live after the site rebuilds (about a minute)
//   POST submit-review       story, quotes, short description: waits for Sioux Falls Go to approve
//   POST photo               upload a photo (hero or gallery)
//   POST remove-photo        take a photo out of the gallery
//   POST save-deal / delete-deal   their own specials (postcard mailer deals stay admin only)

const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const DISCOUNT_TYPES = ['percent-off', 'dollar-off', 'bogo', 'free-item', 'bundle', 'other'];

function imageType(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}

async function ownDeals(slug: string) {
  const files = (await listDir('src/content/deals')).filter((f) => f.name.endsWith('.json'));
  const out: any[] = [];
  for (const f of files) {
    const file = await getFile(f.path);
    if (!file) continue;
    try {
      const d = JSON.parse(file.text);
      if (d.business === slug && !d.mailerCampaign) out.push({ id: f.name.replace(/\.json$/, ''), ...d });
    } catch {}
  }
  return out;
}

export default async (req: Request) => {
  const slug = businessFromCookie(req.headers.get('cookie') || '');
  if (!slug) return json({ error: 'Please sign in again.' }, 401);
  const account: any = await getStore('business-accounts').get(slug, { type: 'json' });
  if (!account?.passwordHash) return json({ error: 'This sign-in was turned off. Contact Sioux Falls Go.' }, 401);
  const reviews = getStore('business-change-requests');

  try {
    if (req.method === 'GET') {
      const { frontmatter, body } = await readBusinessFile(slug);
      const pick = (k: string) => readField(frontmatter, k) ?? '';
      return json({
        slug,
        email: account.email,
        name: pick('name'),
        tier: pick('partnershipTier'),
        phone: pick('phone'), website: pick('website'), hours: pick('hours'), responseTime: pick('responseTime'),
        couponStyle: pick('couponStyle') || 'ticket-stub',
        hoursSchedule: readHours(frontmatter),
        heroImage: pick('heroImage'), gallery: readList(frontmatter, 'gallery'),
        body: body.trim(), pullQuote: pick('pullQuote'), ownerQuote: pick('ownerQuote'), ownerName: pick('ownerName'), excerpt: pick('excerpt'),
        pendingReview: await reviews.get(slug, { type: 'json' }),
        deals: await ownDeals(slug),
      });
    }

    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const input = await req.json().catch(() => ({}));

    if (input.action === 'save') {
      const changes: Record<string, any> = {};
      for (const k of OWNER_INSTANT_FIELDS) if (typeof input[k] === 'string') changes[k] = input[k];
      if (input.hoursSchedule && typeof input.hoursSchedule === 'object') changes.hoursSchedule = input.hoursSchedule;
      if (changes.website && !/^https?:\/\//i.test(changes.website)) changes.website = `https://${changes.website}`;
      const f = await readBusinessFile(slug);
      const next = applyChanges(f.frontmatter, f.body, changes);
      await writeBusinessFile(slug, next.frontmatter, next.body, f.sha, `Owner update: ${readField(f.frontmatter, 'name') || slug}`);
      return json({ ok: true, message: 'Saved. Your profile updates in about a minute.' });
    }

    if (input.action === 'submit-review') {
      const changes: Record<string, string> = {};
      for (const k of OWNER_REVIEW_FIELDS) if (typeof input[k] === 'string') changes[k] = input[k].slice(0, k === 'body' ? 20000 : 400);
      if (!Object.keys(changes).length) return json({ error: 'Nothing to send.' }, 400);
      await reviews.setJSON(slug, { slug, businessName: input.businessName || slug, changes, submittedAt: new Date().toISOString(), email: account.email });
      return json({ ok: true, message: 'Sent. Sioux Falls Go will review your changes, usually within a day or two.' });
    }

    if (input.action === 'photo') {
      const buf = Buffer.from(String(input.data || ''), 'base64');
      if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) return json({ error: 'Photos must be under 3 MB.' }, 400);
      const ext = imageType(buf);
      if (!ext) return json({ error: 'Please upload a JPG, PNG, or WebP photo.' }, 400);
      const path = `public/images/businesses/${slug}-${Date.now()}.${ext}`;
      await putFile(path, buf.toString('base64'), `Owner photo: ${slug}`);
      const url = path.replace(/^public/, '');
      const f = await readBusinessFile(slug);
      const changes = input.kind === 'hero'
        ? { heroImage: url }
        : { gallery: [...readList(f.frontmatter, 'gallery'), url] };
      if (input.kind !== 'hero' && changes.gallery!.length > 12) return json({ error: 'The gallery holds up to 12 photos. Remove one first.' }, 400);
      const next = applyChanges(f.frontmatter, f.body, changes);
      await writeBusinessFile(slug, next.frontmatter, next.body, f.sha, `Owner photo: ${readField(f.frontmatter, 'name') || slug}`);
      return json({ ok: true, url });
    }

    if (input.action === 'remove-photo') {
      const f = await readBusinessFile(slug);
      const gallery = readList(f.frontmatter, 'gallery').filter((g) => g !== input.url);
      const next = applyChanges(f.frontmatter, f.body, { gallery });
      await writeBusinessFile(slug, next.frontmatter, next.body, f.sha, `Owner removed a photo: ${slug}`);
      return json({ ok: true });
    }

    if (input.action === 'save-deal') {
      const d = input.deal || {};
      const title = String(d.title || '').trim(), description = String(d.description || '').trim();
      if (!title || !description) return json({ error: 'A special needs a title and a description.' }, 400);
      if (!DISCOUNT_TYPES.includes(d.discountType)) return json({ error: 'Pick a discount type.' }, 400);
      if (d.expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(d.expiresAt)) return json({ error: 'Use a valid end date.' }, 400);
      let id = String(d.id || '');
      let sha: string | undefined;
      if (id) {
        if (!/^[a-z0-9-]+$/.test(id)) return json({ error: 'Invalid special' }, 400);
        const existing = await getFile(`src/content/deals/${id}.json`);
        if (!existing) return json({ error: 'That special no longer exists.' }, 404);
        const parsed = JSON.parse(existing.text);
        if (parsed.business !== slug || parsed.mailerCampaign) return json({ error: 'You can only edit your own specials.' }, 403);
        sha = existing.sha;
      } else {
        id = `${slug}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40)}-${Date.now().toString(36)}`;
      }
      const deal: Record<string, unknown> = {
        business: slug, title: title.slice(0, 80), description: description.slice(0, 300), discountType: d.discountType,
        valueScore: 50, submittedBy: 'business-owner',
      };
      if (d.expiresAt) deal.expiresAt = d.expiresAt;
      if (d.terms && String(d.terms).trim()) deal.terms = String(d.terms).trim().slice(0, 200);
      await putFile(`src/content/deals/${id}.json`, Buffer.from(JSON.stringify(deal, null, 2) + '\n').toString('base64'), `Owner special: ${slug}`, sha);
      return json({ ok: true, id });
    }

    if (input.action === 'delete-deal') {
      const id = String(input.id || '');
      if (!/^[a-z0-9-]+$/.test(id)) return json({ error: 'Invalid special' }, 400);
      const existing = await getFile(`src/content/deals/${id}.json`);
      if (!existing) return json({ ok: true });
      const parsed = JSON.parse(existing.text);
      if (parsed.business !== slug || parsed.mailerCampaign) return json({ error: 'You can only remove your own specials.' }, 403);
      await deleteFile(`src/content/deals/${id}.json`, existing.sha, `Owner removed special: ${slug}`);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err: any) {
    console.error('biz-portal:', slug, err?.message || err);
    return json({ error: err?.message || 'Something went wrong. Try again.' }, 500);
  }
};

export const config = { path: '/api/biz-portal' };
