import { isAdmin } from './_shared/auth.mts';
import { getFile, putFile, deleteFile } from './_shared/business-file.mts';
import { cleanRedeem } from './_shared/deal-redeem.mts';

// Admin deal controls.
//   POST { action: 'create', business, title, description, discountType, startsAt, endsAt, blackFriday, redeemMethod, redeemValue, redeemNote, terms }
//   POST { action: 'update', id, ...same fields }
//   POST { action: 'delete', id }
// A deal is one JSON file in src/content/deals; the site rebuilds in about a minute.

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const TYPES = ['percent-off', 'dollar-off', 'bogo', 'free-item', 'bundle', 'other'];
const SLUG = /^[a-z0-9-]+$/;
const isDate = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const clean = (s: unknown, max: number) => String(s ?? '').replace(/\s*[–—]\s*/g, ', ').trim().slice(0, max);

function applyFields(deal: Record<string, any>, b: any): string | null {
  if ('title' in b) { const t = clean(b.title, 80); if (t.length < 3) return 'Give the deal a short title.'; deal.title = t; }
  if ('description' in b) { const d = clean(b.description, 300); if (d.length < 8) return 'Add a sentence describing the deal.'; deal.description = d; }
  if ('discountType' in b) deal.discountType = TYPES.includes(b.discountType) ? b.discountType : 'other';
  if ('startsAt' in b) { if (b.startsAt && !isDate(b.startsAt)) return 'Use a valid start date.'; if (b.startsAt) deal.activatesAt = b.startsAt; else delete deal.activatesAt; }
  if ('endsAt' in b) { if (b.endsAt && !isDate(b.endsAt)) return 'Use a valid end date.'; if (b.endsAt) deal.expiresAt = b.endsAt; else delete deal.expiresAt; }
  if (deal.activatesAt && deal.expiresAt && String(deal.expiresAt).slice(0, 10) < String(deal.activatesAt).slice(0, 10)) return 'The end date is before the start date.';
  if ('blackFriday' in b) { if (b.blackFriday) deal.promotion = 'black-friday'; else delete deal.promotion; }
  if ('terms' in b) { const t = clean(b.terms, 200); if (t) deal.terms = t; else delete deal.terms; }
  if ('redeemMethod' in b || 'redeemValue' in b || 'redeemNote' in b) {
    const r = cleanRedeem({ redeemMethod: b.redeemMethod, redeemValue: b.redeemValue, redeemNote: b.redeemNote });
    if ('error' in r) return r.error;
    delete deal.redeemMethod; delete deal.redeemValue; delete deal.redeemNote;
    Object.assign(deal, r);
  }
  return null;
}

export default async (req: Request) => {
  if (!isAdmin(req.headers.get('cookie') || '')) return json({ error: 'Not authenticated' }, 401);
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === 'create') {
      const business = String(b.business || '');
      if (!SLUG.test(business) || !(await getFile(`src/content/businesses/${business}.md`))) return json({ error: 'Pick the business this deal belongs to.' }, 400);
      const deal: Record<string, any> = { business, title: '', description: '', discountType: 'other', valueScore: 60, submittedBy: 'verified-by-team' };
      const err = applyFields(deal, { title: '', description: '', ...b });
      if (err) return json({ error: err }, 400);
      const id = `${business}-${deal.promotion ? 'black-friday-' : ''}${Date.now().toString(36)}`;
      await putFile(`src/content/deals/${id}.json`, Buffer.from(JSON.stringify(deal, null, 2) + '\n').toString('base64'), `Deal added: ${business}`);
      return json({ ok: true, id, message: 'Added. It shows on the site in about a minute.' });
    }

    const id = String(b.id || '');
    if (!SLUG.test(id)) return json({ error: 'Invalid deal' }, 400);
    const path = `src/content/deals/${id}.json`;
    const file = await getFile(path);
    if (!file) return json({ error: 'That deal was not found. It may already be gone.' }, 404);

    if (b.action === 'delete') {
      await deleteFile(path, file.sha, `Deal removed: ${id}`);
      return json({ ok: true, message: 'Removed. It comes off the site in about a minute.' });
    }
    if (b.action === 'update') {
      const deal = JSON.parse(file.text);
      const err = applyFields(deal, b);
      if (err) return json({ error: err }, 400);
      await putFile(path, Buffer.from(JSON.stringify(deal, null, 2) + '\n').toString('base64'), `Deal updated: ${id}`, file.sha);
      return json({ ok: true, message: 'Saved. The site updates in about a minute.' });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (err: any) {
    return json({ error: err?.message || 'Something went wrong' }, 502);
  }
};

export const config = { path: '/api/manage-deal' };
