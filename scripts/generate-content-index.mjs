import { execSync } from 'node:child_process';
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

// "Today" in Sioux Falls, not UTC. SFG_NOW (YYYY-MM-DD) lets a test build pretend it is another day.
function chicagoToday() {
  const o = process.env.SFG_NOW;
  const d = o && /^\d{4}-\d{2}-\d{2}$/.test(o) ? new Date(`${o}T18:00:00Z`) : new Date();
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
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

  // Real article index — used by the scheduled auto-generation function for
  // internal linking and avoiding duplicate angles, the same real data the
  // admin UI already gets directly via getCollection().
  const todayStr = chicagoToday();
  const articleIndex = articles.map((a) => ({
    title: a.title,
    slug: a.file.replace(/\.md$/, ''),
    category: a.category,
    description: a.seo?.description || '',
    publishedAt: a.publishedAt || '',
    contentType: a.contentType || '',
    cluster: a.cluster || '',
    clusterRole: a.clusterRole || '',
    heroImage: a.heroImage || '',
    // false means scheduled: the file exists but the page is not built yet,
    // so nothing should link to it and it must not be written about as live.
    live: (a.publishedAt || '0000-00-00') <= todayStr,
  }));
  fs.writeFileSync(path.join(ROOT, 'public/article-index.json'), JSON.stringify(articleIndex, null, 2));

  // What is already on the events calendar, read by the weekly event search
  // so it does not suggest duplicates.
  const evDir = path.join(ROOT, 'src/content/events');
  const eventsIndex = fs.existsSync(evDir)
    ? fs.readdirSync(evDir).filter((f) => f.endsWith('.json')).map((f) => {
        const e = readJson(path.join(evDir, f));
        return { id: f.replace(/\.json$/, ''), title: e.title, dates: (e.occurrences || []).map((o) => o.date) };
      })
    : [];
  fs.writeFileSync(path.join(ROOT, 'public/events-index.json'), JSON.stringify(eventsIndex, null, 2));

  // Categories and whether each has its own header photo yet, read by the
  // photo finder so it only opens the category files that need a photo.
  const businessCount = {};
  // Which industry each page belongs to, so analytics can group search results by industry.
  const pageCategory = {};
  if (fs.existsSync(bizDir)) for (const f of fs.readdirSync(bizDir).filter((x) => x.endsWith('.md'))) {
    const m = fs.readFileSync(path.join(bizDir, f), 'utf8').match(/^category:\s*"?([a-z0-9-]+)"?/m);
    if (m) businessCount[m[1]] = (businessCount[m[1]] || 0) + 1;
    if (m) pageCategory[`/businesses/${f.replace(/\.md$/, '')}`] = m[1];
  }
  const categoryIndex = categories.map((c) => ({
    slug: c.slug, name: c.name, description: c.seo?.description || '', parent: c.parentCategory || '',
    icon: c.icon || 'pin', heroImage: c.heroImage || '', heroImageAlt: c.heroImageAlt || '', locked: !!c.heroImageLocked,
    businesses: businessCount[c.slug] || 0,
    articles: articles.filter((a) => a.category === c.slug).length,
    parentName: (categories.find((p) => p.slug === c.parentCategory) || {}).name || '',
    hasIntro: !!c.intro,
  })).sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(path.join(ROOT, 'public/category-index.json'), JSON.stringify(categoryIndex, null, 2));
  for (const c of categories) pageCategory[`/${c.slug}`] = c.slug;
  for (const a of articles) if (a.category) pageCategory[`/guides/${a.file.replace(/\.md$/, '')}`] = a.category;
  fs.writeFileSync(path.join(ROOT, 'public/page-categories.json'), JSON.stringify(pageCategory));

  // When each article file was first committed, so two articles published on
  // the same day still sort newest first (the later one is the latest).
  // When each article's publish date was last set (its first commit, or a
  // later reschedule), so the newest one leads even among same-day articles.
  const times = {};
  try {
    const log = execSync("git log --format=@%ct --name-only -G'^publishedAt:' -- src/content/articles", { cwd: ROOT, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    let t = 0;
    for (const line of log.split('\n')) {
      if (line.startsWith('@')) t = Number(line.slice(1));
      else if (line.endsWith('.md')) { const slug = path.basename(line, '.md'); if (!(slug in times)) times[slug] = t; }
    }
  } catch { /* no git history available; same-day order falls back to title */ }
  fs.mkdirSync(path.join(ROOT, 'src/generated'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'src/generated/article-times.json'), JSON.stringify(times));

  // The planned topic queue, read by the scheduled generator.
  const queueSrc = path.join(ROOT, 'data/topic-queue.json');
  if (fs.existsSync(queueSrc)) fs.copyFileSync(queueSrc, path.join(ROOT, 'public/topic-queue.json'));

  // Community picks — the shared host-community flyer content, exposed as
  // a static asset so the PDF-generation function can read it at runtime
  // (functions don't have direct access to Astro's content collections).
  try {
    const picksDir = path.join(ROOT, 'src/content/community-picks');
    const picksFiles = fs.readdirSync(picksDir).filter((f) => f.endsWith('.md'));
    if (picksFiles.length > 0) {
      const raw = fs.readFileSync(path.join(picksDir, picksFiles[0]), 'utf-8');
      // Isolate ONLY the frontmatter block first — this file also has an
      // HTML comment below it with example syntax for documentation
      // purposes, which must never be mistaken for real data.
      const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---/);
      const frontmatter = frontmatterMatch ? frontmatterMatch[1] : '';
      // The picks array is small and predictably structured — a targeted
      // manual parser here avoids adding a new dependency just for this.
      const picks = [];
      const pickBlocks = frontmatter.split(/\n\s*-\s+category:/).slice(1);
      for (const block of pickBlocks) {
        const category = block.match(/^\s*"?(\w+)"?/)?.[1] || '';
        const name = block.match(/name:\s*"(.+?)"/)?.[1] || '';
        const description = block.match(/description:\s*"(.+?)"/)?.[1] || '';
        const recommendedByMatch = block.match(/recommendedBy:\s*\[(.*?)\]/);
        const recommendedBy = recommendedByMatch
          ? recommendedByMatch[1].split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean)
          : [];
        if (name) picks.push({ category, name, description, recommendedBy });
      }
      fs.writeFileSync(path.join(ROOT, 'public/community-picks.json'), JSON.stringify({ picks }, null, 2));
    }
  } catch (err) {
    console.log('Could not generate community-picks.json:', err.message);
  }
  console.log(`Content gap report written: ${outPath}`);
  console.log('Top 5 priorities:');
  report.slice(0, 5).forEach((r, i) => console.log(`  ${i + 1}. ${r.name} (score: ${r.priorityScore}) — ${r.reasons.join('; ')}`));
}

main();

// When this version of the site was built. The admin and owner dashboards
// check this after a save to confirm the change is actually live.
fs.writeFileSync(path.join(ROOT, 'public/build-info.json'), JSON.stringify({ builtAt: Date.now(), commit: process.env.COMMIT_REF || '' }));
