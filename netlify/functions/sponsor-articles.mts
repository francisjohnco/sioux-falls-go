import { isAdmin } from './_shared/auth.mts';
import { readText, commitTextFiles } from './_shared/git-batch.mts';

// Sponsor or un-sponsor many articles at once, in a single commit (one rebuild).
//   POST { business: slug, add: [articleSlug...], remove: [articleSlug...] }
// Adding replaces any existing sponsor on that article.

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const SLUG = /^[a-z0-9-]+$/;

function setSponsor(raw: string, business: string | null): string {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error('Article file has no frontmatter');
  const lines = m[1].split('\n').filter((l) => !/^sponsoredBy:/.test(l));
  if (business) {
    const at = lines.findIndex((l) => /^category:/.test(l));
    lines.splice(at === -1 ? 1 : at + 1, 0, `sponsoredBy: "${business}"`);
  }
  return `---\n${lines.join('\n')}\n---\n${m[2]}`;
}

export default async (req: Request) => {
  if (!isAdmin(req.headers.get('cookie') || '')) return json({ error: 'Not authenticated' }, 401);
  const body = await req.json().catch(() => ({}));
  const business = String(body.business || '');
  const add: string[] = (Array.isArray(body.add) ? body.add : []).filter((s: string) => SLUG.test(s)).slice(0, 100);
  const remove: string[] = (Array.isArray(body.remove) ? body.remove : []).filter((s: string) => SLUG.test(s)).slice(0, 100);
  if (add.length && !SLUG.test(business)) return json({ error: 'Pick a business first.' }, 400);
  if (!add.length && !remove.length) return json({ error: 'Nothing to change.' }, 400);
  try {
    if (add.length && !(await readText(`src/content/businesses/${business}.md`))) return json({ error: 'That business was not found.' }, 404);
    const files: { path: string; content: string }[] = [];
    for (const [slugs, who] of [[add, business], [remove, null]] as const) {
      for (const slug of slugs) {
        const path = `src/content/articles/${slug}.md`;
        const raw = await readText(path);
        if (!raw) continue;
        files.push({ path, content: setSponsor(raw, who) });
      }
    }
    if (!files.length) return json({ error: 'Those articles were not found.' }, 404);
    await commitTextFiles(files, `Sponsorships: ${add.length ? `${add.length} added for ${business}` : ''}${add.length && remove.length ? ', ' : ''}${remove.length ? `${remove.length} removed` : ''}`);
    return json({ ok: true, message: `Saved ${files.length} article${files.length === 1 ? '' : 's'}. The sponsor banners update in about a minute.` });
  } catch (err: any) {
    return json({ error: err?.message || 'Something went wrong' }, 502);
  }
};

export const config = { path: '/api/sponsor-articles' };
