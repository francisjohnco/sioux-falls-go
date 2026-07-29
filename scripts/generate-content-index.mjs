/**
 * Computes a priority-ranked content gap report and writes it to
 * public/content-gaps.json, where it's fetched by the admin Content Engine
 * and the scheduled auto-generation function.
 *
 * Priority scoring (Phase 1 — no external API needed):
 *   +100  category has a business but ZERO articles at all (urgent gap)
 *   +60   category was created in the last 30 days (new-category priority,
 *         per the explicit rule: a new category with even 1 listing jumps
 *         the queue, since it has no content yet)
 *   +40   category is missing 1+ of the required article types
 *         (cost-guide / buying-guide / seasonal-guide / faq) for service
 *         categories specifically
 *   +10   per business in the category with NO article mentioning it via
 *         relatedBusinesses (content should eventually touch every listed business)
 *   -5    per existing article already in the category (more coverage = lower priority)
 *
 * Phase 2 (documented, not yet wired): once Google Search Console and
 * Analytics are connected, real query-gap and low-engagement signals get
 * added on top of this base score — see docs/content-strategy.md.
 *
 * Run: node scripts/generate-content-index.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const REQUIRED_TYPES = ['cost-guide', 'buying-guide', 'seasonal-guide', 'faq'];

// Single source of truth, matching docs/content-strategy.md exactly.
const PARENT_UMBRELLA_CATEGORIES = new Set(['home-services', 'professional-services']);
const SERVICE_CATEGORIES = new Set([
  'appliance-repair-service', 'cleaning-services', 'electricians', 'flooring',
  'home-watch-services', 'lawn-care', 'local-tree-services', 'marketing-agencies',
  'painters', 'plumbers', 'real-estate-agents', 'window-cleaning',
]);
const DUAL_CATEGORIES = new Set(['coffee-shops', 'restaurants-dining', 'shopping-retail']);
const DUAL_REQUIRED_COUNT = 5; // anchor, resident, visitor, neighborhood, seasonal — no fixed "types" checklist
// Categories flagged in content-strategy.md as "not in this launch batch" —
// overlapping business-owner content needing consolidation first, or
// spotlight/giveaway categories that aren't evergreen-guide categories at
// all. Excluded entirely so the algorithm never treats them as gaps.
const EXCLUDED_FROM_SCORING = new Set([
  ...PARENT_UMBRELLA_CATEGORIES,
  'for-local-businesses', 'grow-with-sfg', 'marketing-tips-insights',
  'community-spotlight', 'local-spotlights', 'spotlight-giveaways',
]);

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function readFrontmatter(mdPath) {
  const raw = fs.readFileSync(mdPath, 'utf-8');
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  // Minimal frontmatter parse — good enough for the flat fields we need here
  const lines = match[1].split('\n');
  const data = {};
  for (const line of lines) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (!m) continue;
    let [, key, val] = m;
    val = val.trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    data[key] = val;
  }
  return data;
}

function main() {
  const catDir = path.join(ROOT, 'src/content/categories');
  const artDir = path.join(ROOT, 'src/content/articles');
  const bizDir = path.join(ROOT, 'src/content/businesses');

  const categories = fs.readdirSync(catDir).filter((f) => f.endsWith('.json')).map((f) => ({
    file: f,
    ...readJson(path.join(catDir, f)),
  }));

  const articleFiles = fs.readdirSync(artDir).filter((f) => f.endsWith('.md'));
  const articles = articleFiles.map((f) => ({ file: f, ...readFrontmatter(path.join(artDir, f)) }));

  const businessFiles = fs.readdirSync(bizDir).filter((f) => f.endsWith('.md'));
  const businesses = businessFiles.map((f) => ({ file: f, ...readFrontmatter(path.join(bizDir, f)) }));

  const now = new Date();
  const report = categories
    .filter((cat) => !EXCLUDED_FROM_SCORING.has(cat.slug))
    .map((cat) => {
      const catArticles = articles.filter((a) => a.category === cat.slug);
      const catBusinesses = businesses.filter((b) => b.category === cat.slug);
      const isService = SERVICE_CATEGORIES.has(cat.slug);
      const isDual = DUAL_CATEGORIES.has(cat.slug);

      let score = 0;
      const reasons = [];

      if (catBusinesses.length > 0 && catArticles.length === 0) {
        score += 100;
        reasons.push('Has businesses but zero articles');
      }

      if (cat.createdAt) {
        const ageDays = (now - new Date(cat.createdAt)) / 86400000;
        if (ageDays <= 30) {
          score += 60;
          reasons.push(`New category (${Math.round(ageDays)} days old)`);
        }
      }

      let missingTypes = [];
      if (isService) {
        const presentTypes = new Set(catArticles.map((a) => a.contentType));
        missingTypes = REQUIRED_TYPES.filter((t) => !presentTypes.has(t));
        if (missingTypes.length > 0) {
          score += 40 * (missingTypes.length / REQUIRED_TYPES.length);
          reasons.push(`Missing article types: ${missingTypes.join(', ')}`);
        }
      } else if (isDual && catArticles.length < DUAL_REQUIRED_COUNT) {
        score += 40 * ((DUAL_REQUIRED_COUNT - catArticles.length) / DUAL_REQUIRED_COUNT);
        reasons.push(`${DUAL_REQUIRED_COUNT - catArticles.length} more article(s) needed for full dual-audience coverage`);
      }

    const mentionedBusinessIds = new Set(
      catArticles.flatMap((a) => {
        try {
          return JSON.parse(a.relatedBusinesses || '[]');
        } catch {
          return [];
        }
      })
    );
    const unmentioned = catBusinesses.filter((b) => !mentionedBusinessIds.has(b.file.replace('.md', '')));
    score += unmentioned.length * 10;
    if (unmentioned.length > 0) reasons.push(`${unmentioned.length} business(es) never mentioned in any article`);

    score -= catArticles.length * 5;

    return {
      slug: cat.slug,
      name: cat.name,
      articleCount: catArticles.length,
      businessCount: catBusinesses.length,
      categoryType: isService ? 'service' : isDual ? 'dual' : 'other',
      missingTypes,
      priorityScore: Math.round(score),
      reasons,
    };
  });

  report.sort((a, b) => b.priorityScore - a.priorityScore);

  const outPath = path.join(ROOT, 'public/content-gaps.json');
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: now.toISOString(), categories: report }, null, 2));
  console.log(`Content gap report written: ${outPath}`);
  console.log('Top 5 priorities:');
  report.slice(0, 5).forEach((r, i) => console.log(`  ${i + 1}. ${r.name} (score: ${r.priorityScore}) — ${r.reasons.join('; ')}`));
}

main();
