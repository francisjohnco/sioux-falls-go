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

// Simple scalar frontmatter fields — string, number, boolean, or date-as-string
const SCALAR_FIELDS = [
  'name', 'address', 'showAddress', 'placeId', 'latitude', 'longitude',
  'phone', 'website', 'verifiedAt', 'claimed', 'heroImage', 'partnershipTier',
  'googleRating', 'googleReviewCount', 'giveawaysPerYear',
  'pullQuote', 'ownerName', 'ownerQuote', 'responseTime', 'couponStyle',
] as const;
type ScalarField = (typeof SCALAR_FIELDS)[number];

// hoursSchedule is a nested object (mon/tue/wed/thu/fri/sat/sun), handled separately
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

function parseFrontmatter(raw: string): { frontmatter: string; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error('File does not have valid frontmatter');
  return { frontmatter: match[1], body: match[2] };
}

function setFrontmatterField(frontmatter: string, field: ScalarField, value: unknown): string {
  const lines = frontmatter.split('\n');
  const isNumber = typeof value === 'number';
  const isBoolean = typeof value === 'boolean';
  const serialized =
    isBoolean || isNumber
      ? String(value)
      : value === null || value === ''
        ? null
        : `"${String(value).replace(/"/g, '\\"')}"`;

  const fieldLineIdx = lines.findIndex((l) => l.match(new RegExp(`^${field}:\\s`)));

  if (serialized === null) {
    // Clearing the field entirely (e.g. an empty text input means "remove this")
    if (fieldLineIdx !== -1) lines.splice(fieldLineIdx, 1);
    return lines.join('\n');
  }

  const newLine = `${field}: ${serialized}`;
  if (fieldLineIdx !== -1) {
    lines[fieldLineIdx] = newLine;
  } else {
    const categoryIdx = lines.findIndex((l) => l.match(/^category:\s/));
    lines.splice(categoryIdx !== -1 ? categoryIdx + 1 : 1, 0, newLine);
  }
  return lines.join('\n');
}

function setHoursSchedule(frontmatter: string, hours: Record<string, string>): string {
  const lines = frontmatter.split('\n');
  const startIdx = lines.findIndex((l) => l.match(/^hoursSchedule:/));
  let endIdx = lines.length;
  if (startIdx !== -1) {
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (lines[i].match(/^\S/)) { endIdx = i; break; }
    }
  }
  const hasAnyValue = DAY_KEYS.some((k) => hours[k]);
  const newBlock = !hasAnyValue
    ? []
    : ['hoursSchedule:', ...DAY_KEYS.filter((k) => hours[k]).map((k) => `  ${k}: "${hours[k].replace(/"/g, '\\"')}"`)];

  if (startIdx === -1) {
    return newBlock.length === 0 ? frontmatter : [...lines, ...newBlock].join('\n');
  }
  lines.splice(startIdx, endIdx - startIdx, ...newBlock);
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
  const updates: Record<string, unknown> = body?.updates;

  if (!slug || !updates || typeof updates !== 'object') {
    return new Response(JSON.stringify({ error: 'Missing slug or updates in request body' }), { status: 400 });
  }

  const { hoursSchedule, body: newBodyContent, ...scalarUpdates } = updates;
  const invalidKeys = Object.keys(scalarUpdates).filter((k) => !SCALAR_FIELDS.includes(k as ScalarField));
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
    const { frontmatter, body: currentBodyContent } = parseFrontmatter(currentRaw);

    // 2. Apply scalar field changes
    let updatedFrontmatter = frontmatter;
    for (const [field, value] of Object.entries(scalarUpdates)) {
      updatedFrontmatter = setFrontmatterField(updatedFrontmatter, field as ScalarField, value);
    }

    // 3. Apply hoursSchedule if provided
    if (hoursSchedule && typeof hoursSchedule === 'object') {
      updatedFrontmatter = setHoursSchedule(updatedFrontmatter, hoursSchedule as Record<string, string>);
    }

    // 4. Use new body content if provided, otherwise keep what's already there
    const finalBody = typeof newBodyContent === 'string' ? newBodyContent : currentBodyContent;
    const newRaw = `---\n${updatedFrontmatter}\n---\n${finalBody}`;

    // Sanity check: the result must still have valid, parseable frontmatter
    // structure before we ever send it to GitHub.
    parseFrontmatter(newRaw);

    // 5. Write it back, including the sha so GitHub rejects a stale write
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
      const isConflict = putRes.status === 409;
      return new Response(JSON.stringify({
        error: isConflict ? 'Someone else saved a change to this business at the same moment — refresh and try again' : 'GitHub commit failed',
        detail: errText,
      }), {
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
