import { isAdmin } from './_shared/auth.mts';
import { readText, commitTextFiles } from './_shared/git-batch.mts';
import { chicagoToday } from './_shared/schedule.mts';

// Admin category controls.
//   POST { action: 'create', name, parent?, icon?, seoTitle?, seoDescription? }
//   POST { action: 'update', slug, name?, parent?, icon?, seoTitle?, seoDescription? }
// A new category gets its own page at /<slug> on the next rebuild, and the
// photo finder gives it a header photo within the hour (or pick one in Admin).

const ICONS = ['zap', 'wrench', 'layers', 'leaf', 'sparkles', 'home', 'key', 'tree', 'window', 'plug', 'megaphone', 'coffee', 'utensils', 'briefcase', 'map', 'clipboard', 'star', 'rocket', 'mic', 'gift', 'pin', 'phone', 'globe', 'heart', 'handshake', 'newspaper', 'book', 'activity', 'mail'];
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const clean = (s: unknown, max: number) => String(s || '').replace(/\s*[–—]\s*/g, ', ').replace(/\s+/g, ' ').trim().slice(0, max);
export const slugify = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

// Search-result copy that fits Google's limits (about 60 and 155 characters).
function defaultSeo(name: string) {
  const long = `Best ${name} in Sioux Falls, SD`;
  const title = long.length <= 60 ? long : `${name} in Sioux Falls`.slice(0, 60);
  const description = `Compare locally owned ${name.toLowerCase()} in Sioux Falls, SD. Real contact info, hours, and reviews, plus local guides to help you choose with confidence.`.slice(0, 158);
  return { title, description };
}

export default async (req: Request) => {
  if (!isAdmin(req.headers.get('cookie') || '')) return json({ error: 'Not authenticated' }, 401);
  const body = await req.json().catch(() => ({}));
  try {
    const parent = body.parent ? String(body.parent) : '';
    if (parent && (!/^[a-z0-9-]+$/.test(parent) || !(await readText(`src/content/categories/${parent}.json`)))) return json({ error: 'That parent category does not exist.' }, 400);
    const icon = ICONS.includes(body.icon) ? body.icon : undefined;

    if (body.action === 'create') {
      const name = clean(body.name, 60);
      if (name.length < 3) return json({ error: 'Give the category a name, for example "Custom Home Builders".' }, 400);
      const slug = slugify(body.slug || name);
      if (!slug) return json({ error: 'That name needs at least one letter or number.' }, 400);
      if (await readText(`src/content/categories/${slug}.json`)) return json({ error: `A category at /${slug} already exists.` }, 409);
      const seo = defaultSeo(name);
      const cat: Record<string, unknown> = {
        name, slug, aliases: [], createdAt: chicagoToday(),
        playbook: { topics: ['hiring', 'pricing', 'local considerations'], contentTypes: ['faq', 'cost-guide', 'buying-guide', 'local-resource'] },
        seo: { title: clean(body.seoTitle, 60) || seo.title, description: clean(body.seoDescription, 160) || seo.description },
        icon: icon || 'pin',
      };
      if (parent) cat.parentCategory = parent;
      await commitTextFiles([{ path: `src/content/categories/${slug}.json`, content: JSON.stringify(cat, null, 2) + '\n' }], `New category: ${name}`);
      return json({ ok: true, slug, message: `Created. The page goes live at /${slug} in about a minute, and gets its own header photo within the hour.` });
    }

    if (body.action === 'update') {
      const slug = String(body.slug || '');
      if (!/^[a-z0-9-]+$/.test(slug)) return json({ error: 'Invalid category' }, 400);
      const path = `src/content/categories/${slug}.json`;
      const raw = await readText(path);
      if (!raw) return json({ error: 'That category was not found.' }, 404);
      if (parent === slug) return json({ error: 'A category cannot be its own parent.' }, 400);
      const cat = JSON.parse(raw);
      if (body.name) cat.name = clean(body.name, 60);
      if (body.seoTitle) cat.seo.title = clean(body.seoTitle, 60);
      if (body.seoDescription) cat.seo.description = clean(body.seoDescription, 160);
      if (icon) cat.icon = icon;
      if ('parent' in body) { if (parent) cat.parentCategory = parent; else delete cat.parentCategory; }
      await commitTextFiles([{ path, content: JSON.stringify(cat, null, 2) + '\n' }], `Category updated: ${cat.name}`);
      return json({ ok: true, message: 'Saved. The page updates in about a minute.' });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err: any) {
    return json({ error: err?.message || 'Something went wrong' }, 502);
  }
};

export const config = { path: '/api/manage-category' };
