// Shared logic for the Google Reviews sync — used by both
// sync-google-reviews-scheduled.mts (cron only) and
// sync-google-reviews.mts (HTTP path only). Netlify does not allow a
// single function to have both a schedule and a path, so this got split
// into two thin entry points that both call the same code here.

export interface GoogleReview {
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

export async function syncAllBusinesses() {
  const { GOOGLE_PLACES_API_KEY, GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env;
  if (!GOOGLE_PLACES_API_KEY || !GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    throw new Error('Missing GOOGLE_PLACES_API_KEY / GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO');
  }

  const ghHeaders = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
  };

  const listUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/src/content/businesses`;
  const listRes = await fetch(listUrl, { headers: ghHeaders });
  if (!listRes.ok) {
    throw new Error('Could not list businesses directory from GitHub');
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
  return { summary, results };
}
