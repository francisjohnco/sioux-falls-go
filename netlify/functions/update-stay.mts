// Env vars required (same as update-business.mts): GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO
//
// Lets the admin dashboard edit a stay listing's details, verification
// status, amenities, and insider tips. Same safe pattern used everywhere
// else in this project: fetch current file + sha, edit only what changed,
// write back with everything else intact.

const SCALAR_FIELDS = [
  'name', 'hostName', 'locationLabel', 'guestCapacityLabel', 'airbnbUrl',
  'bedrooms', 'bathrooms', 'amenityCount',
] as const;
type ScalarField = (typeof SCALAR_FIELDS)[number];

function parseFrontmatter(raw: string): { frontmatter: string; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error('File does not have valid frontmatter');
  return { frontmatter: match[1], body: match[2] };
}

function setFrontmatterField(frontmatter: string, field: ScalarField, value: unknown): string {
  const lines = frontmatter.split('\n');
  const isNumber = typeof value === 'number';
  const serialized =
    isNumber ? String(value)
    : value === null || value === '' ? null
    : `"${String(value).replace(/"/g, '\\"')}"`;

  const fieldLineIdx = lines.findIndex((l) => l.match(new RegExp(`^${field}:\\s`)));
  if (serialized === null) {
    if (fieldLineIdx !== -1) lines.splice(fieldLineIdx, 1);
    return lines.join('\n');
  }
  const newLine = `${field}: ${serialized}`;
  if (fieldLineIdx !== -1) {
    lines[fieldLineIdx] = newLine;
  } else {
    const nameIdx = lines.findIndex((l) => l.match(/^name:\s/));
    lines.splice(nameIdx !== -1 ? nameIdx + 1 : 1, 0, newLine);
  }
  return lines.join('\n');
}

function replaceBlock(frontmatter: string, field: string, newLines: string[]): string {
  const lines = frontmatter.split('\n');
  const startIdx = lines.findIndex((l) => l.match(new RegExp(`^${field}:`)));
  let endIdx = lines.length;
  if (startIdx !== -1) {
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (lines[i].match(/^\S/)) { endIdx = i; break; }
    }
  }
  const block = newLines.length === 0 ? [`${field}: []`] : [`${field}:`, ...newLines];
  if (startIdx === -1) {
    return [...lines, ...block].join('\n');
  }
  lines.splice(startIdx, endIdx - startIdx, ...block);
  return lines.join('\n');
}

function setVerified(frontmatter: string, verified: boolean): string {
  const lines = frontmatter.split('\n');
  const idx = lines.findIndex((l) => l.match(/^verifiedAt:\s/));
  if (!verified) {
    if (idx !== -1) lines.splice(idx, 1);
    return lines.join('\n');
  }
  const today = new Date().toISOString().split('T')[0]; // unquoted, required by z.date()
  const newLine = `verifiedAt: ${today}`;
  if (idx !== -1) { lines[idx] = newLine; } else { lines.splice(1, 0, newLine); }
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

  const { verified, amenities, insiderTips, ...scalarUpdates } = updates;
  const invalidKeys = Object.keys(scalarUpdates).filter((k) => !SCALAR_FIELDS.includes(k as ScalarField));
  if (invalidKeys.length > 0) {
    return new Response(JSON.stringify({ error: `Not an editable field: ${invalidKeys.join(', ')}` }), { status: 400 });
  }

  const path = `src/content/stays/${slug}.md`;
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
  const ghHeaders = { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' };

  try {
    const getRes = await fetch(apiUrl, { headers: ghHeaders });
    if (!getRes.ok) {
      return new Response(JSON.stringify({ error: `Stay file not found: ${slug}` }), { status: 404 });
    }
    const fileData = await getRes.json();
    const currentRaw = Buffer.from(fileData.content, 'base64').toString('utf-8');
    const { frontmatter, body: currentBody } = parseFrontmatter(currentRaw);

    let updatedFrontmatter = frontmatter;
    for (const [field, value] of Object.entries(scalarUpdates)) {
      updatedFrontmatter = setFrontmatterField(updatedFrontmatter, field as ScalarField, value);
    }

    if (typeof verified === 'boolean') {
      updatedFrontmatter = setVerified(updatedFrontmatter, verified);
    }

    if (Array.isArray(amenities)) {
      updatedFrontmatter = replaceBlock(
        updatedFrontmatter, 'amenities',
        amenities.map((a: string) => `  - "${String(a).replace(/"/g, '\\"')}"`)
      );
    }

    if (Array.isArray(insiderTips)) {
      updatedFrontmatter = replaceBlock(
        updatedFrontmatter, 'insiderTips',
        insiderTips.flatMap((t: { tip: string; category: string }) => [
          `  - tip: "${String(t.tip).replace(/"/g, '\\"')}"`,
          `    category: "${t.category}"`,
        ])
      );
    }

    const newRaw = `---\n${updatedFrontmatter}\n---\n${currentBody}`;
    parseFrontmatter(newRaw); // sanity check before writing

    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: { ...ghHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Admin: update stay "${slug}"`,
        content: Buffer.from(newRaw).toString('base64'),
        sha: fileData.sha,
      }),
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      const isConflict = putRes.status === 409;
      return new Response(JSON.stringify({
        error: isConflict ? 'Someone else saved a change to this stay at the same moment — refresh and try again' : 'GitHub commit failed',
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

export const config = { path: '/api/update-stay' };
