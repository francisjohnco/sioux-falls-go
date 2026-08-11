// Env vars required (same as publish-draft.mts):
//   GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO
//
// Lets the admin dashboard change specific fields on an existing business
// listing — partnership tier, address visibility, verified/claimed status —
// without touching the rest of that business's content file. GitHub's
// Contents API requires the file's current sha for a safe update (prevents
// silently overwriting a change someone else just made), so this fetches
// the file first, edits only the requested frontmatter keys, and writes
// the whole file back with everything else — body text, other fields —
// left exactly as it was.

const EDITABLE_FIELDS = ['partnershipTier', 'showAddress', 'claimed', 'verifiedAt'] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

function parseFrontmatter(raw: string): { frontmatter: string; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error('File does not have valid frontmatter');
  return { frontmatter: match[1], body: match[2] };
}

function setFrontmatterField(frontmatter: string, field: EditableField, value: unknown): string {
  const lines = frontmatter.split('\n');
  const serialized =
    typeof value === 'boolean'
      ? String(value)
      : value === null
        ? null
        : `"${String(value)}"`;

  const fieldLineIdx = lines.findIndex((l) => l.match(new RegExp(`^${field}:\\s`)));

  if (serialized === null) {
    // removing the field entirely (e.g. clearing partnershipTier back to none)
    if (fieldLineIdx !== -1) lines.splice(fieldLineIdx, 1);
    return lines.join('\n');
  }

  const newLine = `${field}: ${serialized}`;
  if (fieldLineIdx !== -1) {
    lines[fieldLineIdx] = newLine;
  } else {
    // insert after the `category:` line, present on every business file
    const categoryIdx = lines.findIndex((l) => l.match(/^category:\s/));
    lines.splice(categoryIdx !== -1 ? categoryIdx + 1 : 1, 0, newLine);
  }
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
  const slug: string | undefined = body?.slug;
  const updates: Partial<Record<EditableField, unknown>> = body?.updates;

  if (!slug || !updates || typeof updates !== 'object') {
    return new Response(JSON.stringify({ error: 'Missing slug or updates in request body' }), { status: 400 });
  }
  const invalidKeys = Object.keys(updates).filter((k) => !EDITABLE_FIELDS.includes(k as EditableField));
  if (invalidKeys.length > 0) {
    return new Response(JSON.stringify({ error: `Not an editable field: ${invalidKeys.join(', ')}` }), { status: 400 });
  }

  const path = `src/content/businesses/${slug}.md`;
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
  const ghHeaders = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
  };

  try {
    // 1. Fetch the current file — need its content and sha
    const getRes = await fetch(apiUrl, { headers: ghHeaders });
    if (!getRes.ok) {
      return new Response(JSON.stringify({ error: `Business file not found: ${slug}` }), { status: 404 });
    }
    const fileData = await getRes.json();
    const currentRaw = Buffer.from(fileData.content, 'base64').toString('utf-8');
    const { frontmatter, body: bodyContent } = parseFrontmatter(currentRaw);

    // 2. Apply only the requested field changes
    let updatedFrontmatter = frontmatter;
    for (const [field, value] of Object.entries(updates)) {
      updatedFrontmatter = setFrontmatterField(updatedFrontmatter, field as EditableField, value);
    }

    const newRaw = `---\n${updatedFrontmatter}\n---\n${bodyContent}`;

    // 3. Write it back, including the sha so GitHub rejects a stale write
    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: { ...ghHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Admin: update ${Object.keys(updates).join(', ')} for ${slug}`,
        content: Buffer.from(newRaw).toString('base64'),
        sha: fileData.sha,
      }),
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      return new Response(JSON.stringify({ error: 'GitHub commit failed', detail: errText }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, slug, updated: Object.keys(updates) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Update failed', detail: String(err?.message || err) }), {
      status: 500,
    });
  }
};

export const config = { path: '/api/update-business' };
