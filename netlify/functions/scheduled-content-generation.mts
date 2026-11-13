import { getStore } from '@netlify/blobs';
import { runDraftGeneration, fetchHeroImage } from './_shared/draft-generator.mts';
import { buildArticleFile, commitNewFile, cleanDraft, validateDraft, isNearDuplicate } from './_shared/article-file.mts';
import { chicagoToday, planNextSlot } from './_shared/schedule.mts';

// A Netlify SCHEDULED function. "0 14 * * 1,3" is 2 PM UTC every Monday and
// Wednesday. Change the cron string to change how often articles are made.
//
// Order of work on each run:
//   1. If there is a topic queue (data/topic-queue.json, served at
//      /topic-queue.json), take the first topic that has no article yet.
//      That is how a planned campaign, like the drain cleaning series, gets
//      written one article per run, in order.
//   2. Otherwise fall back to the original behavior: pick the category with
//      the biggest content gap.
//
// Auto-publish. When the "auto-publish" admin setting is on, a queued draft
// that passes the quality check is committed straight to the repo, dated for
// the next open Tuesday or Thursday, so it goes live on its own. A draft that
// fails the check, or any draft while auto-publish is off, lands in the
// pending review queue for a human, exactly as before.

// Never let unreviewed drafts pile up. Past this many waiting, a run does nothing.
const MAX_PENDING = 6;

async function loadPending(): Promise<any[]> {
  const store = getStore('pending-drafts');
  const { blobs } = await store.list();
  return (await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' })))).filter(Boolean) as any[];
}

export default async () => {
  const siteUrl = process.env.URL || process.env.DEPLOY_URL;
  if (!siteUrl) return new Response('Missing site URL env var', { status: 500 });

  // A draft waiting for review counts as "taken". Without this, the same
  // topic was picked every run, because a waiting draft is not an article yet.
  const pending = await loadPending();
  if (pending.length >= MAX_PENDING) {
    console.log(`${pending.length} drafts already waiting for review, skipping this run.`);
    return new Response('Review queue full, skipped', { status: 200 });
  }
  const pendingSlugs = new Set(pending.map((p) => p.slug).filter(Boolean));
  const pendingCategories = new Set(pending.map((p) => p.categorySlug).filter(Boolean));
  const pendingTitles = pending.map((p) => p.draft?.title).filter(Boolean);

  const articleIndexRes = await fetch(`${siteUrl}/article-index.json`);
  const articleIndex: any[] = articleIndexRes.ok ? await articleIndexRes.json() : [];
  const allSlugs = new Set(articleIndex.map((a) => a.slug));
  const liveSlugs = new Set(articleIndex.filter((a) => a.live !== false).map((a) => a.slug));
  const linkable = articleIndex.filter((a) => a.live !== false);

  const queueRes = await fetch(`${siteUrl}/topic-queue.json`);
  if (queueRes.ok) {
    const queue = await queueRes.json();
    const next = (queue.topics || []).find((t: any) => !allSlugs.has(t.slug) && !pendingSlugs.has(t.slug));
    if (next) return await runQueuedTopic(next, queue, articleIndex, linkable, liveSlugs);
    console.log('Topic queue is complete, falling back to gap-driven generation.');
  }

  return await runGapDriven(siteUrl, linkable, pendingCategories, [...articleIndex.map((a) => a.title), ...pendingTitles]);
};

async function runQueuedTopic(next: any, queue: any, articleIndex: any[], linkable: any[], liveSlugs: Set<string>) {
  const categorySlug = next.category || queue.category;
  const categoryName = next.categoryName || queue.categoryName || categorySlug;
  const relatedBusinesses = next.relatedBusinesses || queue.relatedBusinesses || [];

  const direction = [
    `Write this exact article. Use this exact title: ${next.title}`,
    next.keywords?.length ? `Work these search phrases in naturally, without stuffing: ${next.keywords.join('; ')}.` : '',
    next.brief || '',
    'Never use em dashes or en dashes anywhere. Use commas, periods, parentheses, or the word "to" for ranges.',
    'Do not present any price as a Sioux Falls average unless you were given a source for it. If you mention costs, call them typical national ranges and tell the reader to get a written quote.',
  ].filter(Boolean).join('\n');

  let draft;
  try {
    draft = await runDraftGeneration({
      categoryName,
      categorySlug,
      contentType: next.contentType,
      direction,
      existingArticles: [
        ...linkable.filter((a) => a.category === categorySlug),
        ...linkable.filter((a) => a.category !== categorySlug).slice(0, 15),
      ],
    });
  } catch (err: any) {
    console.error('Queued draft generation failed:', err?.message || err);
    return new Response('Generation failed', { status: 500 });
  }

  draft = cleanDraft(draft);
  const hero = await fetchHeroImage(`${categoryName} ${next.title}`.slice(0, 80));
  const withImage = { ...draft, heroImage: hero?.url, heroImageCredit: hero?.credit };

  const autoPublish = (await getStore('admin-settings').get('auto-publish')) === 'on';
  const problems = validateDraft(withImage, liveSlugs);

  if (autoPublish && problems.length === 0) {
    const publishDate = planNextSlot(articleIndex.map((a) => a.publishedAt).filter(Boolean), chicagoToday());
    const file = buildArticleFile({ draft: withImage, categorySlug, contentType: next.contentType, relatedBusinesses, publishDate, slug: next.slug });
    const res = await commitNewFile(file.path, file.content, `Content Engine: schedule "${draft.title}" for ${publishDate}`);
    if (res.ok) {
      console.log(`Auto-scheduled "${draft.title}" for ${publishDate}`);
      return new Response(`Scheduled "${draft.title}" for ${publishDate}`, { status: 200 });
    }
    console.error('Auto-publish commit failed, sending to review instead:', res.status, res.detail);
  } else if (autoPublish) {
    console.warn(`Draft for "${next.title}" failed the quality check, sending to review: ${problems.join('; ')}`);
  }

  const store = getStore('pending-drafts');
  const id = `${next.slug}-${Date.now()}`;
  await store.setJSON(id, {
    id,
    categorySlug,
    categoryName,
    contentType: next.contentType,
    draft: withImage,
    slug: next.slug,
    relatedBusinesses,
    generatedAt: new Date().toISOString(),
    status: 'pending-review',
    reviewNote: problems.length ? `Held for review: ${problems.join('; ')}` : autoPublish ? 'Held for review: commit failed' : 'Auto-publish is off',
  });
  console.log(`Queued "${draft.title}" for review as ${id}`);
  return new Response(`Queued "${draft.title}" for review`, { status: 200 });
}

async function runGapDriven(siteUrl: string, linkable: any[], pendingCategories: Set<string>, takenTitles: string[]) {
  const gapsRes = await fetch(`${siteUrl}/content-gaps.json`);
  if (!gapsRes.ok) return new Response('Could not fetch content-gaps.json', { status: 500 });
  const gaps = await gapsRes.json();

  // Skip any category that already has a draft waiting for review.
  const topGap = gaps.categories.find((c: any) => c.priorityScore > 0 && !pendingCategories.has(c.slug));
  if (!topGap) {
    console.log('No positive-priority content gaps right now, nothing to generate.');
    return new Response('Nothing to do', { status: 200 });
  }

  const contentTypeToGenerate = topGap.categoryType === 'service' && topGap.missingTypes?.length > 0 ? topGap.missingTypes[0] : 'local-resource';

  let draft;
  try {
    draft = await runDraftGeneration({
      categoryName: topGap.name,
      categorySlug: topGap.slug,
      contentType: contentTypeToGenerate,
      existingArticles: [
        ...linkable.filter((a: any) => a.category === topGap.slug),
        ...linkable.filter((a: any) => a.category !== topGap.slug).slice(0, 15),
      ],
    });
  } catch (err: any) {
    console.error('Draft generation failed:', err?.message || err);
    return new Response('Generation failed', { status: 500 });
  }

  draft = cleanDraft(draft);
  if (isNearDuplicate(draft.title, takenTitles)) {
    console.warn(`Discarded "${draft.title}": too close to an existing article or waiting draft.`);
    return new Response('Discarded a near-duplicate draft', { status: 200 });
  }
  const heroImage = await fetchHeroImage(`${topGap.name} ${contentTypeToGenerate.replace(/-/g, ' ')}`.trim());
  const draftWithImage = { ...draft, heroImage: heroImage?.url, heroImageCredit: heroImage?.credit };

  const store = getStore('pending-drafts');
  const id = `${topGap.slug}-${Date.now()}`;
  await store.setJSON(id, {
    id, categorySlug: topGap.slug, categoryName: topGap.name, contentType: contentTypeToGenerate,
    draft: draftWithImage, generatedAt: new Date().toISOString(), status: 'pending-review',
  });

  console.log(`Generated draft "${draft.title}" for ${topGap.name}, queued for review as ${id}`);
  return new Response(`Generated draft for ${topGap.name}: ${draft.title}`, { status: 200 });
}

export const config = {
  schedule: '0 14 * * 1,3', // 2pm UTC, Monday and Wednesday
  background: true, // generation can take longer than the 10s synchronous limit
};
