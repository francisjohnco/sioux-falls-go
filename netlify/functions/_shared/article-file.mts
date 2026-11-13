import { chicagoToday, isValidDateString } from './schedule.mts';

export function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);
}

// House style: no em dashes or en dashes. Number ranges become "to".
export function cleanDashes(text: string | undefined | null): string {
  return (text ?? '')
    .replace(/(\d)\s*[\u2013\u2014]\s*(\$?\d)/g, '$1 to $2')
    .replace(/\s*[\u2013\u2014]\s*/g, ', ');
}

export interface Draft {
  title: string;
  seoTitle: string;
  seoDescription: string;
  bodyMarkdown: string;
  embeddedFaqs: { question: string; answer: string }[];
  heroImage?: string;
  heroImageCredit?: { photographer: string; profileUrl: string };
}

export function cleanDraft<T extends Draft>(draft: T): T {
  return {
    ...draft,
    title: cleanDashes(draft.title),
    seoTitle: cleanDashes(draft.seoTitle || draft.title),
    seoDescription: cleanDashes(draft.seoDescription),
    bodyMarkdown: cleanDashes(draft.bodyMarkdown),
    embeddedFaqs: (draft.embeddedFaqs || []).map((f) => ({ question: cleanDashes(f.question), answer: cleanDashes(f.answer) })),
  };
}

// Returns a list of problems. An empty list means the draft is safe to
// publish without a human reading it first. Anything else goes to the
// manual review queue instead of going live on its own.
export function validateDraft(draft: Draft, knownLiveSlugs: Set<string>): string[] {
  const problems: string[] = [];
  const words = (draft.bodyMarkdown || '').split(/\s+/).filter(Boolean).length;
  if (!draft.title) problems.push('missing title');
  if (words < 600) problems.push(`body too short (${words} words)`);
  const desc = draft.seoDescription || '';
  if (desc.length < 50 || desc.length > 175) problems.push(`SEO description length ${desc.length}`);
  if ((draft.embeddedFaqs || []).length < 3) problems.push('fewer than 3 FAQs');
  if (/lorem ipsum|\bTODO\b|\[insert/i.test(draft.bodyMarkdown || '')) problems.push('placeholder text');
  for (const m of (draft.bodyMarkdown || '').matchAll(/\]\(\/guides\/([a-z0-9-]+)\/?\)/g)) {
    if (!knownLiveSlugs.has(m[1])) problems.push(`link to a guide that is not live: ${m[1]}`);
  }
  return problems;
}

function buildFrontmatter(fields: Record<string, unknown>): string {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else if (typeof value === 'object') {
      lines.push(`${key}:`);
      for (const [k2, v2] of Object.entries(value as Record<string, unknown>)) lines.push(`  ${k2}: ${JSON.stringify(v2)}`);
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

export interface BuildInput {
  draft: Draft;
  categorySlug: string;
  contentType: string;
  author?: string;
  relatedBusinesses?: string[];
  sponsoredBy?: string;
  publishDate?: string; // YYYY-MM-DD. Future date means scheduled.
  slug?: string;
}

export function buildArticleFile(input: BuildInput): { path: string; slug: string; content: string; publishDate: string } {
  const { draft, categorySlug, contentType, author, relatedBusinesses, sponsoredBy } = input;
  const slug = input.slug || slugify(draft.title);
  // "Today" is today in Sioux Falls. The UTC date would stamp an evening
  // approval with tomorrow's date and hide it until the next rebuild.
  const publishDate = isValidDateString(input.publishDate) ? input.publishDate : chicagoToday();

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
    reviewedBy: undefined, // deliberately left blank, set when a human actually reviews it
    publishedAt: publishDate,
    updatedAt: publishDate,
    seo: { title: draft.seoTitle, description: draft.seoDescription },
    heroImage: draft.heroImage || undefined,
    heroImageCredit: draft.heroImageCredit || undefined,
  });

  return { path: `src/content/articles/${slug}.md`, slug, publishDate, content: `${frontmatter}\n\n${draft.bodyMarkdown}\n` };
}

export async function commitNewFile(path: string, content: string, message: string): Promise<{ ok: boolean; status: number; detail?: string }> {
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) throw new Error('GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO not configured');
  const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: Buffer.from(content).toString('base64') }),
  });
  if (res.ok) return { ok: true, status: res.status };
  return { ok: false, status: res.status, detail: await res.text() };
}
