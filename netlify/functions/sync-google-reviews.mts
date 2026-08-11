// Env vars required:
//   GOOGLE_PLACES_API_KEY  — from Google Cloud Console, Places API enabled, billing on
//   GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO — same as your other content functions
//
// Runs on a schedule (see config.schedule below) and also callable on-demand
// from the admin dashboard's "Sync Reviews Now" button.
//
// For every business that has a real placeId set in its content file, this
// calls Google's Place Details API and asks for the "reviews" field. Google
// returns up to 5 reviews — that's a hard cap on their side, not something
// this code can raise — chosen by their own relevance ranking, not
// hand-picked. Businesses without a placeId are skipped, not errored.
//
// Per Google's Places API terms, review content is meant to be kept current
// rather than cached indefinitely — that's the whole reason this runs on a
// schedule instead of being a one-time fetch.

interface GoogleReview {
  author_name: string;
  rating: number;
  text: string;
  relative_time_description: string;
}

function parseFrontmatter(raw: string): { frontmatter: string; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error('File does not have valid frontmatter');
  return { frontmatter: match[1], body: match[2] };
}

function extractField(frontmatter: string, field: string): string | null {
  const m = frontmatter.match(new RegExp(`^${field}:\\s*"([^"]*)"`, 'm'));
  return m ? m[1] : null;
}

function yamlEscape(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function setReviewsBlock(frontmatter: string, reviews: GoogleReview[]): string {
  const lines = frontmatter.split('\n');
  const startIdx = lines.findIndex((l) => l.match(/^reviews:/));

  // Find where the reviews block ends — the next line that starts a new
  // top-level key (no leading whitespace), or end of frontmatter.
  let endIdx = lines.length;
  if (startIdx !== -1) {
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (lines[i].match(/^\S/)) { endIdx = i; break; }
    }
  }

  const newBlock =
    reviews.length === 0
      ? ['reviews: []']
      : [
          'reviews:',
          ...reviews.flatMap((r) => [
            `  - author: "${yamlEscape(r.author_name)}"`,
            `    rating: ${r.rating}`,
            `    text: "${yamlEscape(r.text)}"`,
            `    date: "${yamlEscape(r.relative_time_description)}"`,
          ]),
        ];

  if (startIdx === -1) {
    // no existing reviews field — append at the end
    return [...lines, ...newBlock].join('\n');
  }
  lines.splice(startIdx, endIdx - startIdx, ...newBlock);
  return lines.join('\n');
}

async function syncOneBusiness(
  slug: string,
  placeId: string,
  ghHeaders: Record<string, string>,
  apiUrl: string,
  apiKey: string
): Promise<{ slug: string; status: 'updated' | 'no-reviews' | 'error'; detail?: string }> {
  try {
    const placesRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=reviews&key=${apiKey}`
    );
    const placesData = await placesRes.json();
    if (placesData.status !== 'OK') {
      return { slug, status: 'error', detail: `Google API status: ${placesData.status}` };
    }
    const reviews: GoogleReview[] = placesData.result?.reviews || [];
    if (reviews.length === 0) {
      return { slug, status: 'no-reviews' };
    }

    const getRes = await fetch(apiUrl, { headers: ghHeaders });
    if (!getRes.ok) return { slug, status: 'error', detail: 'Could not fetch content file from GitHub' };
    const fileData = await getRes.json();
    const currentRaw = Buffer.from(fileData.content, 'base64').toString('utf-8');
    const { frontmatter, body } = parseFrontmatter(currentRaw);
    const updatedFrontmatter = setReviewsBlock(frontmatter, reviews.slice(0, 5));
    const newRaw = `---\n${updatedFrontmatter}\n---\n${body}`;

    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: { ...ghHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Sync Google reviews for ${slug}`,
        content: Buffer.from(newRaw).toString('base64'),
        sha: fileData.sha,
      }),
    });
    if (!putRes.ok) return { slug, status: 'error', detail: await putRes.text() };

    return { slug, status: 'updated' };
  } catch (err: any) {
    return { slug, status: 'error', detail: String(err?.message || err) };
  }
}

export default async (req: Request) => {
  const { GOOGLE_PLACES_API_KEY, GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env;
  if (!GOOGLE_PLACES_API_KEY || !GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    return new Response(
      JSON.stringify({ error: 'Missing GOOGLE_PLACES_API_KEY / GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // On-demand calls from the admin dashboard require the same session
  // cookie as other admin actions. Scheduled invocations (no req, or no
  // cookie header) are trusted since only Netlify's own scheduler can
  // trigger those.
  if (req && req.method === 'POST') {
    const cookieHeader = req.headers.get('cookie') || '';
    if (!cookieHeader.includes('sfg_admin_session=')) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
    }
  }

  const ghHeaders = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
  };

  const listUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/src/content/businesses`;
  const listRes = await fetch(listUrl, { headers: ghHeaders });
  if (!listRes.ok) {
    return new Response(JSON.stringify({ error: 'Could not list businesses directory from GitHub' }), { status: 500 });
  }
  const files: Array<{ name: string }> = await listRes.json();

  const results: Array<{ slug: string; status: string; detail?: string }> = [];

  for (const file of files) {
    if (!file.name.endsWith('.md')) continue;
    const slug = file.name.replace(/\.md$/, '');
    const fileApiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/src/content/businesses/${file.name}`;

    const fileRes = await fetch(fileApiUrl, { headers: ghHeaders });
    if (!fileRes.ok) continue;
    const fileData = await fileRes.json();
    const raw = Buffer.from(fileData.content, 'base64').toString('utf-8');
    const { frontmatter } = parseFrontmatter(raw);
    const placeId = extractField(frontmatter, 'placeId');

    if (!placeId) {
      results.push({ slug, status: 'skipped-no-place-id' });
      continue;
    }

    const result = await syncOneBusiness(slug, placeId, ghHeaders, fileApiUrl, GOOGLE_PLACES_API_KEY);
    results.push(result);
  }

  const summary = {
    total: results.length,
    updated: results.filter((r) => r.status === 'updated').length,
    skipped: results.filter((r) => r.status === 'skipped-no-place-id').length,
    errors: results.filter((r) => r.status === 'error'),
  };

  console.log('Review sync complete:', JSON.stringify(summary));
  return new Response(JSON.stringify({ ok: true, summary, results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = {
  path: '/api/sync-google-reviews',
  schedule: '0 8 * * 1', // 8am UTC every Monday — weekly refresh, matches Google's own ToS expectation to keep review content current
};
