import { isAdmin } from './_shared/auth.mts';
import { addBusinessPhoto, readBusinessFile, readList, applyChanges, writeBusinessFile } from './_shared/business-file.mts';

// Admin: add a main photo, logo, or gallery photo to any business, or remove a gallery photo.
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

export default async (req: Request) => {
  if (!isAdmin(req.headers.get('cookie') || '')) return json({ error: 'Not authenticated' }, 401);
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const b = await req.json().catch(() => ({}));
  const slug = String(b.slug || '');
  if (!/^[a-z0-9-]+$/.test(slug)) return json({ error: 'Invalid business' }, 400);
  try {
    if (b.action === 'remove') {
      const f = await readBusinessFile(slug);
      const gallery = readList(f.frontmatter, 'gallery').filter((g) => g !== b.url);
      const next = applyChanges(f.frontmatter, f.body, { gallery });
      await writeBusinessFile(slug, next.frontmatter, next.body, f.sha, `Admin removed a photo: ${slug}`);
      return json({ ok: true, gallery });
    }
    const kind = b.kind === 'hero' ? 'hero' : b.kind === 'logo' ? 'logo' : 'gallery';
    const r = await addBusinessPhoto(slug, kind, b.data, 'Admin');
    return 'error' in r ? json(r, 400) : json({ ok: true, url: r.url });
  } catch (err: any) {
    return json({ error: err?.message || 'Upload failed' }, 502);
  }
};

export const config = { path: '/api/admin-biz-photo' };
