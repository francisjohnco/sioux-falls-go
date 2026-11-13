import { getStore } from '@netlify/blobs';
import { buildArticleFile, commitNewFile, cleanDraft, explainGitHubError } from './_shared/article-file.mts';
import { chicagoToday } from './_shared/schedule.mts';
import { isAdmin } from './_shared/auth.mts';

// Env vars required: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO
//
// Commits an approved draft as an article file. With no publishDate it goes
// live today. With a future publishDate the file is committed now but the
// site holds it back until that date, so approving never has to mean
// "publish this minute".

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const cookieHeader = req.headers.get('cookie') || '';
  if (!isAdmin(cookieHeader)) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });

  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    return new Response(JSON.stringify({ error: 'GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  const body = await req.json().catch(() => null);
  if (!body?.draft) return new Response(JSON.stringify({ error: 'Missing draft in request body' }), { status: 400 });

  const { draft, categorySlug, contentType, author, relatedBusinesses, sponsoredBy, pendingDraftId, publishDate, slug, cluster, clusterRole } = body;

  try {
    const file = buildArticleFile({ draft: cleanDraft(draft), categorySlug, contentType, author, relatedBusinesses, sponsoredBy, publishDate, slug, cluster, clusterRole });
    const scheduled = file.publishDate > chicagoToday();

    const res = await commitNewFile(
      file.path,
      file.content,
      scheduled ? `Content Engine: schedule "${draft.title}" for ${file.publishDate}` : `Content Engine: publish "${draft.title}"`
    );

    if (!res.ok) {
      console.error('publish-draft: GitHub commit failed', res.status, res.detail);
      return new Response(JSON.stringify({ error: explainGitHubError(res.status), githubStatus: res.status }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    if (pendingDraftId) await getStore('pending-drafts').delete(pendingDraftId);

    return new Response(JSON.stringify({ ok: true, path: file.path, slug: file.slug, publishDate: file.publishDate, scheduled }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Publish failed', detail: String(err?.message || err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: '/api/publish-draft' };
