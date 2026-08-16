import { getStore } from '@netlify/blobs';

// Env vars required:
//   GITHUB_TOKEN — a fine-grained GitHub Personal Access Token with
//                  "Contents: Read and write" permission on this one repo
//   GITHUB_OWNER — your GitHub username, e.g. "francisjohnco"
//   GITHUB_REPO  — the repo name, e.g. "sioux-falls-go"

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

function buildFrontmatter(fields: Record<string, unknown>): string {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else if (typeof value === 'object') {
      lines.push(`${key}:`);
      for (const [k2, v2] of Object.entries(value as Record<string, unknown>)) {
        lines.push(`  ${k2}: ${JSON.stringify(v2)}`);
      }
    } else if (key === 'publishedAt' || key === 'updatedAt') {
      lines.push(`${key}: ${value}`); // unquoted date, required by z.date()
    } else if (typeof value === 'boolean') {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const cookieHeader = req.headers.get('cookie') || '';
  if (!cookieHeader.includes('sfg_admin_session=')) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    return new Response(
      JSON.stringify({ error: 'GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.draft) {
    return new Response(JSON.stringify({ error: 'Missing draft in request body' }), { status: 400 });
  }

  const { draft, categorySlug, contentType, author, relatedBusinesses, sponsoredBy, pendingDraftId } = body;
  const slug = slugify(draft.title);
  const today = new Date().toISOString().split('T')[0];

  const frontmatter = buildFrontmatter({
    title: draft.title,
    category: categorySlug,
    contentType,
    relatedNeighborhoods: [],
    relatedArticles: [],
    relatedBusinesses: relatedBusinesses || [],
    embeddedFaqs: draft.embeddedFaqs || [],
    sponsoredBy: sponsoredBy || undefined,
    evergreen: true,
    author: author || 'Sioux Falls Go Editorial',
    aiAssisted: true,
    reviewedBy: undefined, // deliberately left blank — set when a human actually reviews it
    publishedAt: today,
    updatedAt: today,
    seo: { title: draft.seoTitle, description: draft.seoDescription },
    heroImage: draft.heroImage || undefined,
    heroImageCredit: draft.heroImageCredit || undefined,
  });

  const fileContent = `${frontmatter}\n\n${draft.bodyMarkdown}\n`;
  const path = `src/content/articles/${slug}.md`;
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;

  try {
    const res = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
      },
      body: JSON.stringify({
        message: `Content Engine: publish "${draft.title}"`,
        content: Buffer.from(fileContent).toString('base64'),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ error: 'GitHub commit failed', detail: errText }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (pendingDraftId) {
      const pendingStore = getStore('pending-drafts');
      await pendingStore.delete(pendingDraftId);
    }

    return new Response(JSON.stringify({ ok: true, path, slug }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Publish failed', detail: String(err?.message || err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config = { path: '/api/publish-draft' };
