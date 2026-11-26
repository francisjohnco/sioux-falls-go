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
  heroImageAlt?: string;
  heroImageCredit?: { photographer: string; profileUrl: string; source?: string };
}

// Search descriptions over the limit get trimmed at a sentence or word
// boundary instead of holding the whole article for review.
function fitDescription(d: string): string {
  const t = (d || '').trim();
  if (t.length <= 170) return t;
  const cut = t.slice(0, 170);
  const sentence = cut.lastIndexOf('. ');
  if (sentence > 90) return cut.slice(0, sentence + 1);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:]$/, '') + '.';
}

export function cleanDraft<T extends Draft>(draft: T): T {
  return {
    ...draft,
    title: cleanDashes(draft.title),
    seoTitle: cleanDashes(draft.seoTitle || draft.title),
    seoDescription: fitDescription(cleanDashes(draft.seoDescription)),
    bodyMarkdown: cleanDashes(draft.bodyMarkdown),
    embeddedFaqs: (draft.embeddedFaqs || []).map((f) => ({ question: cleanDashes(f.question), answer: cleanDashes(f.answer) })),
  };
}

// Returns a list of problems. An empty list means the draft is safe to
// publish without a human reading it first. Anything else goes to the
// manual review queue instead of going live on its own.
// knownSlugs: every article that exists or is planned. Linking to a planned
// article is fine (the link stays plain text until it goes live); linking to
// a made-up address is not.
export function validateDraft(draft: Draft, knownSlugs: Set<string>): string[] {
  const problems: string[] = [];
  const words = (draft.bodyMarkdown || '').split(/\s+/).filter(Boolean).length;
  if (!draft.title) problems.push('missing title');
  if (words < 600) problems.push(`body too short (${words} words)`);
  const desc = draft.seoDescription || '';
  if (desc.length < 50 || desc.length > 175) problems.push(`SEO description length ${desc.length}`);
  if ((draft.embeddedFaqs || []).length < 4) problems.push('fewer than 4 FAQs');
  if (/lorem ipsum|\bTODO\b|\[insert/i.test(draft.bodyMarkdown || '')) problems.push('placeholder text');
  for (const m of (draft.bodyMarkdown || '').matchAll(/\]\(\/guides\/([a-z0-9-]+)\/?\)/g)) {
    if (!knownSlugs.has(m[1])) problems.push(`link to a guide that does not exist: ${m[1]}`);
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
  cluster?: string;
  clusterRole?: 'pillar' | 'support';
}

export function buildArticleFile(input: BuildInput): { path: string; slug: string; content: string; publishDate: string } {
  const { draft, categorySlug, contentType, author, relatedBusinesses, sponsoredBy, cluster, clusterRole } = input;
  const slug = input.slug || slugify(draft.title);
  // "Today" is today in Sioux Falls. The UTC date would stamp an evening
  // approval with tomorrow's date and hide it until the next rebuild.
  const publishDate = isValidDateString(input.publishDate) ? input.publishDate : chicagoToday();

  const frontmatter = buildFrontmatter({
    title: draft.title,
    category: categorySlug,
    contentType,
    cluster: cluster || undefined,
    clusterRole: clusterRole || undefined,
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
    heroImageAlt: draft.heroImage ? draft.heroImageAlt || undefined : undefined,
    heroImageCredit: draft.heroImageCredit || undefined,
  });

  return { path: `src/content/articles/${slug}.md`, slug, publishDate, content: `${frontmatter}\n\n${draft.bodyMarkdown}\n` };
}

// Rough topic fingerprint of a title: lowercase words, minus filler and the
// city name, with simple endings trimmed so "finding", "find", "therapist",
// and "therapy" collapse together.
const STOP = new Set('a an and the to of in for on at by with your you what know before book how why when guide local locals sioux falls sd south dakota 2026 2027 vs or is are do does it its from about without up more can get'.split(' '));
function fingerprint(title: string): Set<string> {
  return new Set(
    title.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
      .filter((w) => w && !STOP.has(w))
      .map((w) => w.replace(/(ings|ing|ists|ist|ies|ers|er|es|s|y)$/, '').slice(0, 7))
      .filter((w) => w.length > 1)
  );
}

// True when a new title is about the same thing as one already written or
// waiting for review. Catches reworded repeats like "How to Find a Good
// Massage Therapist" vs "Finding Massage Therapy, What to Know".
export function isNearDuplicate(title: string, others: string[], threshold = 0.6): boolean {
  const a = fingerprint(title);
  if (a.size === 0) return false;
  return others.some((o) => {
    const b = fingerprint(o);
    const shared = [...a].filter((w) => b.has(w)).length;
    const union = new Set([...a, ...b]).size;
    // Three shared words, not two: two shared words is usually just the topic
    // name ("massage therapy"), which every article in a category has.
    return shared >= 3 && shared / union >= threshold;
  });
}

// Turns a GitHub API status into something a person can act on.
export function explainGitHubError(status: number): string {
  if (status === 401) return 'GitHub rejected the site\'s key (GITHUB_TOKEN in Netlify). It has most likely expired. Create a new token and replace it in Netlify, then try again.';
  if (status === 403 || status === 404) return 'The site\'s GitHub key (GITHUB_TOKEN in Netlify) is not allowed to write to the repository. A new token with Contents read and write access will fix it.';
  if (status === 409 || status === 422) return 'An article with this web address already exists, so nothing was overwritten. Change the title and try again.';
  return `GitHub refused the save (status ${status}). Try again in a minute.`;
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
