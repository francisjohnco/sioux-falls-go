import { getStore } from '@netlify/blobs';
import { runDraftGeneration, heroForDraft } from './_shared/draft-generator.mts';
import { buildArticleFile, commitNewFile, cleanDraft, validateDraft, isNearDuplicate } from './_shared/article-file.mts';
import { chicagoToday, planNextSlot } from './_shared/schedule.mts';

// A Netlify SCHEDULED function. "0 14 * * 1,3" is 2 PM UTC every Monday and
// Wednesday. Each run writes at most ONE article.
//
// Content is organized in topic clusters: one main guide (pillar) per topic
// plus supporting articles that each cover a different angle. Every supporting
// article links to its main guide, and the article page links the whole
// cluster together automatically.
//
// Order of work on each run:
//   1. The planned topic queue (data/topic-queue.json), one topic per run,
//      in order. That is how the drain cleaning cluster gets written.
//   2. Otherwise, the category with the biggest content gap. A category with
//      no main guide gets its main guide first; after that, each run picks a
//      content type the category does not have yet (cost guide, how to
//      choose, FAQ, seasonal, comparison, checklist, maintenance). When a
//      category has every type, it is skipped. This replaces the old behavior
//      that wrote the same "local resource" article over and over.
//
// Guards against repeats:
//   - a draft waiting for review counts as taken, by slug and by category
//   - at most MAX_PENDING drafts wait at once
//   - a title too close to an existing article or waiting draft is discarded
//
// Auto-publish. With the admin auto-publish switch on, a queued draft that
// passes the quality check is scheduled for the next open Tuesday or
// Thursday. Anything else waits in the review queue with the reason shown.

const MAX_PENDING = 6;

// Supporting article types, in the order a category should get them.
const SUPPORT_TYPES = ['cost-guide', 'buying-guide', 'faq', 'seasonal-guide', 'comparison', 'checklist', 'maintenance-guide'];
const TYPE_BRIEF: Record<string, string> = {
  'cost-guide': 'what it typically costs, what changes the price, and how to get a fair quote',
  'buying-guide': 'how to choose a good provider, the questions to ask, and the red flags',
  'faq': 'the specific questions locals actually search, each answered clearly',
  'seasonal-guide': 'how the Sioux Falls seasons affect this topic, and what to do when',
  'comparison': 'a clear comparison of the main options people choose between, with decision criteria',
  'checklist': 'a practical step by step checklist a reader can follow',
  'maintenance-guide': 'how to prevent problems and keep things in good shape over time',
};

// Photos already on an article or a waiting draft, so no two articles share one.
function usedPhotos(articleIndex: any[], pending: any[] = []): Set<string> {
  return new Set([...articleIndex.map((a) => a.heroImage), ...pending.map((p) => p.draft?.heroImage)]
    .filter((u): u is string => typeof u === 'string' && u.startsWith('https://')).map((u) => u.split('?')[0]));
}

async function loadPending(): Promise<any[]> {
  const store = getStore('pending-drafts');
  const { blobs } = await store.list();
  return (await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' })))).filter(Boolean) as any[];
}

export default async () => {
  const siteUrl = process.env.URL || process.env.DEPLOY_URL;
  if (!siteUrl) return new Response('Missing site URL env var', { status: 500 });

  const pending = await loadPending();
  if (pending.length >= MAX_PENDING) {
    console.log(`${pending.length} drafts already waiting for review, skipping this run.`);
    return new Response('Review queue full, skipped', { status: 200 });
  }

  const articleIndexRes = await fetch(`${siteUrl}/article-index.json`);
  const articleIndex: any[] = articleIndexRes.ok ? await articleIndexRes.json() : [];
  const allSlugs = new Set(articleIndex.map((a) => a.slug));
  const pendingSlugs = new Set(pending.map((p) => p.slug).filter(Boolean));
  const takenTitles = [...articleIndex.map((a) => a.title), ...pending.map((p) => p.draft?.title).filter(Boolean)];

  const queueRes = await fetch(`${siteUrl}/topic-queue.json`);
  const queue = queueRes.ok ? await queueRes.json() : null;
  if (queue) {
    const next = (queue.topics || []).find((t: any) => !allSlugs.has(t.slug) && !pendingSlugs.has(t.slug));
    if (next) return await runQueuedTopic(next, queue, articleIndex);
    console.log('Topic queue is complete, moving on to content gaps.');
  }

  return await runGapDriven(siteUrl, articleIndex, pending, takenTitles);
};

// Slugs an article may link to: everything that exists, plus every planned
// topic in the queue. Links to planned topics stay plain text until they
// go live, then turn on by themselves at the next daily rebuild.
function knownSlugs(articleIndex: any[], queue: any): Set<string> {
  const s = new Set(articleIndex.map((a) => a.slug));
  for (const t of queue?.topics || []) s.add(t.slug);
  if (queue?.pillar?.slug) s.add(queue.pillar.slug);
  return s;
}

async function runQueuedTopic(next: any, queue: any, articleIndex: any[]) {
  const categorySlug = next.category || queue.category;
  const categoryName = next.categoryName || queue.categoryName || categorySlug;
  const relatedBusinesses = next.relatedBusinesses || queue.relatedBusinesses || [];
  const pillar = queue.pillar;

  // Link targets: the main guide, the other planned topics in this cluster,
  // and live articles in the same category.
  const clusterTargets = [
    ...(pillar ? [{ title: pillar.title, slug: pillar.slug, category: categorySlug, description: 'The main guide for this topic' }] : []),
    ...(queue.topics || []).filter((t: any) => t.slug !== next.slug).map((t: any) => ({ title: t.title, slug: t.slug, category: categorySlug, description: t.brief || '' })),
    ...articleIndex.filter((a) => a.live !== false && a.category === categorySlug && a.cluster !== queue.cluster),
  ];

  const direction = [
    `Write this exact article. Use this exact title: ${next.title}`,
    `This is one supporting article in a series about ${queue.campaign || categoryName}. It must cover its own angle in depth and not repeat the main guide.`,
    pillar ? `In the first or second paragraph, link to the main guide like this: [${pillar.title}](/guides/${pillar.slug}).` : '',
    'Also link naturally to 2 or 3 other articles from the list below that a reader of this article would want next.',
    next.keywords?.length ? `Work these search phrases in naturally, without stuffing: ${next.keywords.join('; ')}.` : '',
    next.brief || '',
    'Never use em dashes or en dashes anywhere. Use commas, periods, parentheses, or the word "to" for ranges.',
    'Do not present any price as a Sioux Falls average unless you were given a source for it. If you mention costs, call them typical national ranges and tell the reader to get a written quote.',
  ].filter(Boolean).join('\n');

  let draft;
  try {
    draft = await runDraftGeneration({ categoryName, categorySlug, contentType: next.contentType, direction, existingArticles: clusterTargets });
  } catch (err: any) {
    console.error('Queued draft generation failed:', err?.message || err);
    return new Response('Generation failed', { status: 500 });
  }

  draft = cleanDraft(draft);
  const withImage = { ...draft, ...(await heroForDraft({ title: draft.title, seoDescription: draft.seoDescription, category: categoryName, exclude: usedPhotos(articleIndex, await loadPending()) })) };

  const autoPublish = (await getStore('admin-settings').get('auto-publish')) === 'on';
  const problems = validateDraft(withImage, knownSlugs(articleIndex, queue));
  const cluster = queue.cluster;

  if (autoPublish && problems.length === 0) {
    const publishDate = planNextSlot(articleIndex.map((a) => a.publishedAt).filter(Boolean), chicagoToday());
    const file = buildArticleFile({ draft: withImage, categorySlug, contentType: next.contentType, relatedBusinesses, publishDate, slug: next.slug, cluster, clusterRole: 'support' });
    const res = await commitNewFile(file.path, file.content, `Content Engine: schedule "${draft.title}" for ${publishDate}`);
    if (res.ok) {
      console.log(`Auto-scheduled "${draft.title}" for ${publishDate}`);
      return new Response(`Scheduled "${draft.title}" for ${publishDate}`, { status: 200 });
    }
    console.error('Auto-publish commit failed, sending to review instead:', res.status, res.detail);
  } else if (autoPublish) {
    console.warn(`Draft for "${next.title}" failed the quality check, sending to review: ${problems.join('; ')}`);
  }

  const id = `${next.slug}-${Date.now()}`;
  await getStore('pending-drafts').setJSON(id, {
    id, categorySlug, categoryName, contentType: next.contentType, draft: withImage, slug: next.slug,
    relatedBusinesses, cluster, clusterRole: 'support',
    generatedAt: new Date().toISOString(), status: 'pending-review',
    reviewNote: problems.length ? `Held for review: ${problems.join('; ')}` : autoPublish ? 'Held for review: commit failed' : 'Auto-publish is off',
  });
  console.log(`Queued "${draft.title}" for review as ${id}`);
  return new Response(`Queued "${draft.title}" for review`, { status: 200 });
}

async function runGapDriven(siteUrl: string, articleIndex: any[], pending: any[], takenTitles: string[]) {
  const gapsRes = await fetch(`${siteUrl}/content-gaps.json`);
  if (!gapsRes.ok) return new Response('Could not fetch content-gaps.json', { status: 500 });
  const gaps = await gapsRes.json();
  const pendingCategories = new Set(pending.map((p) => p.categorySlug).filter(Boolean));

  // Pick the highest-priority category that has no draft waiting and still
  // has something new to write.
  let pick: { gap: any; role: 'pillar' | 'support'; contentType: string; pillar?: any } | null = null;
  for (const gap of gaps.categories) {
    if (!(gap.priorityScore > 0) || pendingCategories.has(gap.slug)) continue;
    const inCategory = articleIndex.filter((a) => a.category === gap.slug && (a.cluster || gap.slug) === gap.slug);
    const pillar = inCategory.find((a) => a.clusterRole === 'pillar');
    if (!pillar) { pick = { gap, role: 'pillar', contentType: 'local-resource' }; break; }
    const usedTypes = new Set(inCategory.map((a) => a.contentType));
    const type = SUPPORT_TYPES.find((t) => !usedTypes.has(t));
    if (type) { pick = { gap, role: 'support', contentType: type, pillar }; break; }
  }
  if (!pick) {
    console.log('Every gap category either has a draft waiting or has all article types. Nothing to write.');
    return new Response('Nothing to do', { status: 200 });
  }

  const { gap, role, contentType, pillar } = pick;
  const sameCategory = articleIndex.filter((a) => a.live !== false && a.category === gap.slug);
  const direction = role === 'pillar'
    ? [
        `This is the MAIN GUIDE for ${gap.name} in Sioux Falls, the page everything else on this topic links back to.`,
        `Title it as a complete local guide to ${gap.name.toLowerCase()} in Sioux Falls. Cover the whole topic broadly with one section per major subtopic (choosing a provider, costs, what to expect, local considerations, common questions).`,
        'Keep each section useful on its own but leave room for deeper supporting articles later. Link to any listed same-category articles where they fit.',
      ].join('\n')
    : [
        `This is a supporting article for ${gap.name} in Sioux Falls. Its angle: ${TYPE_BRIEF[contentType]}.`,
        `In the first or second paragraph, link to the main guide like this: [${pillar.title}](/guides/${pillar.slug}).`,
        `It must NOT repeat the main guide or any of these existing titles: ${sameCategory.map((a) => a.title).join('; ') || '(none)'}. Pick a clearly different title that matches the angle above.`,
      ].join('\n');

  let draft;
  try {
    draft = await runDraftGeneration({
      categoryName: gap.name,
      categorySlug: gap.slug,
      contentType,
      direction: direction + '\nNever use em dashes or en dashes anywhere.',
      existingArticles: [...sameCategory, ...articleIndex.filter((a) => a.live !== false && a.category !== gap.slug).slice(0, 15)],
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
  const draftWithImage = { ...draft, ...(await heroForDraft({ title: draft.title, seoDescription: draft.seoDescription, category: gap.name, exclude: usedPhotos(articleIndex, pending) })) };

  const id = `${gap.slug}-${Date.now()}`;
  await getStore('pending-drafts').setJSON(id, {
    id, categorySlug: gap.slug, categoryName: gap.name, contentType, draft: draftWithImage,
    cluster: gap.slug, clusterRole: role,
    generatedAt: new Date().toISOString(), status: 'pending-review',
    reviewNote: role === 'pillar' ? `Main guide for ${gap.name}` : `Supporting article for ${gap.name} (${contentType.replace(/-/g, ' ')})`,
  });
  console.log(`Generated ${role} "${draft.title}" for ${gap.name}, queued for review as ${id}`);
  return new Response(`Generated ${role} for ${gap.name}: ${draft.title}`, { status: 200 });
}

export const config = {
  schedule: '0 14 * * 1,3', // 2pm UTC, Monday and Wednesday
  background: true, // generation can take longer than the 10s synchronous limit
};
