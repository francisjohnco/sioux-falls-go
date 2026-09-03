// Env vars required (same as update-business.mts): GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO
//
// Lets the admin dashboard edit an already-published article's title, SEO
// fields, and body text. Same safe pattern as update-business.mts: fetch
// current file + sha, edit only what changed, write back with everything
// else intact.

function parseFrontmatter(raw: string): { frontmatter: string; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error('File does not have valid frontmatter');
  return { frontmatter: match[1], body: match[2] };
}

function setFrontmatterField(frontmatter: string, field: string, value: string): string {
  const lines = frontmatter.split('\n');
  const newLine = `${field}: ${JSON.stringify(value)}`;
  const idx = lines.findIndex((l) => l.match(new RegExp(`^${field}:\\s`)));
  if (idx !== -1) {
    lines[idx] = newLine;
  } else {
    lines.splice(1, 0, newLine);
  }
  return lines.join('\n');
}

function removeFrontmatterField(frontmatter: string, field: string): string {
  const lines = frontmatter.split('\n');
  const idx = lines.findIndex((l) => l.match(new RegExp(`^${field}:\\s`)));
  if (idx !== -1) lines.splice(idx, 1);
  return lines.join('\n');
}

function setNestedSeoField(frontmatter: string, field: 'title' | 'description', value: string): string {
  const lines = frontmatter.split('\n');
  const seoIdx = lines.findIndex((l) => l.match(/^seo:/));
  if (seoIdx === -1) return frontmatter; // shouldn't happen — every real article has a seo block
  for (let i = seoIdx + 1; i < lines.length; i++) {
    if (!lines[i].startsWith('  ')) break;
    if (lines[i].match(new RegExp(`^\\s+${field}:`))) {
      lines[i] = `  ${field}: ${JSON.stringify(value)}`;
      return lines.join('\n');
    }
  }
  lines.splice(seoIdx + 1, 0, `  ${field}: ${JSON.stringify(value)}`);
  return lines.join('\n');
}

function setUnquotedDateField(frontmatter: string, field: string, value: string): string {
  const lines = frontmatter.split('\n');
  const newLine = `${field}: ${value}`; // dates stay unquoted, required by z.date()
  const idx = lines.findIndex((l) => l.match(new RegExp(`^${field}:\\s`)));
  if (idx !== -1) {
    lines[idx] = newLine;
  } else {
    lines.splice(1, 0, newLine);
  }
  return lines.join('\n');
}

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const cookieHeader = req.headers.get('cookie') || '';
  if (!cookieHeader.includes('sfg_admin_session=')) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    return new Response(JSON.stringify({ error: 'GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO not configured' }), { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const slug: string | undefined = body?.slug;
  const updates: Record<string, unknown> = body?.updates;
  if (!slug || !updates) {
    return new Response(JSON.stringify({ error: 'Missing slug or updates' }), { status: 400 });
  }

  const path = `src/content/articles/${slug}.md`;
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
  const ghHeaders = { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' };

  try {
    const getRes = await fetch(apiUrl, { headers: ghHeaders });
    if (!getRes.ok) {
      return new Response(JSON.stringify({ error: `Article file not found: ${slug}` }), { status: 404 });
    }
    const fileData = await getRes.json();
    const currentRaw = Buffer.from(fileData.content, 'base64').toString('utf-8');
    const { frontmatter, body: currentBody } = parseFrontmatter(currentRaw);

    let updatedFrontmatter = frontmatter;
    if (typeof updates.title === 'string') {
      updatedFrontmatter = setFrontmatterField(updatedFrontmatter, 'title', updates.title);
    }
    if (typeof updates.seoTitle === 'string') {
      updatedFrontmatter = setNestedSeoField(updatedFrontmatter, 'title', updates.seoTitle);
    }
    if (typeof updates.seoDescription === 'string') {
      updatedFrontmatter = setNestedSeoField(updatedFrontmatter, 'description', updates.seoDescription);
    }
    // sponsoredBy is a paid Community Champion perk — a plain business-id
    // string, same shape as other reference fields. Empty string means
    // "no sponsor," which removes the line entirely rather than writing
    // an empty value (keeps the field truly optional, matching the schema).
    if (typeof updates.sponsoredBy === 'string') {
      updatedFrontmatter = updates.sponsoredBy.trim() === ''
        ? removeFrontmatterField(updatedFrontmatter, 'sponsoredBy')
        : setFrontmatterField(updatedFrontmatter, 'sponsoredBy', updates.sponsoredBy.trim());
    }
    // updatedAt reflects the real edit, not the original publish date
    updatedFrontmatter = setUnquotedDateField(updatedFrontmatter, 'updatedAt', new Date().toISOString().split('T')[0]);

    const finalBody = typeof updates.bodyMarkdown === 'string' ? updates.bodyMarkdown : currentBody;
    const newRaw = `---\n${updatedFrontmatter}\n---\n${finalBody}`;
    parseFrontmatter(newRaw); // sanity check before writing

    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: { ...ghHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Admin: edit article "${slug}"`,
        content: Buffer.from(newRaw).toString('base64'),
        sha: fileData.sha,
      }),
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      const isConflict = putRes.status === 409;
      return new Response(JSON.stringify({
        error: isConflict ? 'Someone else saved a change to this article at the same moment — refresh and try again' : 'GitHub commit failed',
        detail: errText,
      }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ok: true, slug }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Update failed', detail: String(err?.message || err) }), { status: 500 });
  }
};

export const config = { path: '/api/update-article' };
