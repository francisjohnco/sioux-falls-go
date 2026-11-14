import { listFiles, readText } from './git-batch.mts';

// Reads every article file from GitHub with the fields the photo finder needs.

const field = (fm: string, k: string) => {
  const v = fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm'))?.[1]?.trim();
  if (!v) return undefined;
  try { return v.startsWith('"') ? JSON.parse(v) : v; } catch { return v.replace(/^"|"$/g, ''); }
};

export interface ArticleState {
  slug: string; path: string; raw: string; title: string; description: string; category: string;
  heroImage?: string; hasAlt: boolean; locked: boolean; publishedAt: string;
}

export async function loadArticles(): Promise<ArticleState[]> {
  const files = (await listFiles('src/content/articles')).filter((f) => f.name.endsWith('.md'));
  const out: ArticleState[] = [];
  for (let i = 0; i < files.length; i += 8) {
    const batch = await Promise.all(files.slice(i, i + 8).map(async (f) => ({ f, raw: await readText(f.path) })));
    for (const { f, raw } of batch) {
      if (!raw) continue;
      const fm = raw.match(/^---\n([\s\S]*?)\n---/)?.[1] || '';
      out.push({
        slug: f.name.replace(/\.md$/, ''), path: f.path, raw,
        title: field(fm, 'title') || f.name,
        description: fm.match(/^seo:\n(?:\s+.*\n)*?\s+description:\s*(.+)$/m)?.[1]?.replace(/^"|"$/g, '') || '',
        category: field(fm, 'category') || '',
        heroImage: field(fm, 'heroImage'),
        hasAlt: /^heroImageAlt:/m.test(fm),
        locked: /^heroImageLocked:\s*true/m.test(fm),
        publishedAt: String(field(fm, 'publishedAt') || ''),
      });
    }
  }
  return out;
}

export const needsPhoto = (a: ArticleState) => !a.locked && !a.hasAlt;

