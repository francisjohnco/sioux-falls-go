import { getStore } from '@netlify/blobs';
import { runDraftGeneration, heroForDraft } from './_shared/draft-generator.mts';
import { buildArticleFile, commitNewFile, cleanDraft, validateDraft, isNearDuplicate } from './_shared/article-file.mts';
import { chicagoToday, planNextSlot, planClusterSlot, PUBLISH_WEEKDAYS } from './_shared/schedule.mts';

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

// Runs every hour but only writes when a series is running low: each queue
// (content cluster) is kept a few articles ahead of its own publish days.
// The open-ended gap filler still runs only on its old Monday and Wednesday
// slot, once every queue is finished.
export default async () => {
  const siteUrl = process.env.URL || process.env.DEPLOY_URL;
  if (!siteUrl) return new Response('Missing site URL env var', { status: 500 });

  const engine = getStore('content-engine');
  const lastFail = await engine.get('last-failure');
  if (lastFail && Date.now() - Date.parse(lastFail) < 6 * 3600 * 1000) return new Response('Waiting after a failed run', { status: 200 });

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
  const today = chicagoToday();

  const queueRes = await fetch(`${siteUrl}/topic-queue.json`);
  const file = queueRes.ok ? await queueRes.json() : null;
  const queues: any[] = file ? (file.queues || [file]) : [];

  const due: { queue: any; topic: any; ahead: number }[] = [];
  let unfinished = 0;
  for (const queue of queues) {
    const open = (slug: string) => !allSlugs.has(slug) && !pendingSlugs.has(slug);
    const pillarTopic = queue.pillar?.contentType && open(queue.pillar.slug) ? { ...queue.pillar, role: 'pillar' } : null;
    const topic = pillarTopic || (queue.topics || []).find((t: any) => open(t.slug));
    if (!topic) continue;
    unfinished++;
    const ahead = articleIndex.filter((a) => a.cluster === queue.cluster && a.publishedAt > today).length
      + pending.filter((p) => p.cluster === queue.cluster).length;
    if (ahead < (queue.bufferTarget || 3)) due.push({ queue, topic, ahead });
  }

  if (due.length) {
    due.sort((a, b) => a.ahead - b.ahead);
    const { queue, topic } = due[0];
    const res = await runQueuedTopic(topic, queue, articleIndex);
    if (res.status >= 500) await engine.set('last-failure', new Date().toISOString());
    return res;
  }
  if (unfinished) return new Response('Every series is far enough ahead', { status: 200 });

  // All queues finished: fall back to the gap filler on its old schedule only.
  const now = new Date();
  if (![1, 3].includes(now.getUTCDay()) || now.getUTCHours() !== 14) return new Response('Queues complete, gap filler waits for its slot', { status: 200 });
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
  const isPillar = next.role === 'pillar';

  // Link targets: the main guide, the other planned topics in this cluster,
  // and live articles in the same category.
  const clusterTargets = [
    ...(pillar && !isPillar ? [{ title: pillar.title, slug: pillar.slug, category: categorySlug, description: 'The main guide for this topic' }] : []),
    ...(queue.topics || []).filter((t: any) => t.slug !== next.slug).map((t: any) => ({ title: t.title, slug: t.slug, category: categorySlug, description: t.brief || '' })),
    ...articleIndex.filter((a) => a.live !== false && a.category === categorySlug && a.cluster !== queue.cluster),
  ];

  const direction = [
    `Write this exact article. Use this exact title: ${next.title}`,
    isPillar
      ? `This is the MAIN guide (pillar) for a series about ${queue.campaign || categoryName}. It is the most complete, most useful page on this topic for Sioux Falls. Write 1500 to 2200 words in 6 to 9 H2 sections, each giving the reader a real answer and next step, and in each section link to the matching supporting article from the list below with natural anchor text.`
      : `This is one supporting article in a series about ${queue.campaign || categoryName}. It must cover its own angle in depth and not repeat the main guide.`,
    !isPillar && pillar ? `In the first or second paragraph, link to the main guide like this: [${pillar.title}](/guides/${pillar.slug}).` : '',
    isPillar ? '' : 'Also link naturally to 2 or 3 other articles from the list below that a reader of this article would want next.',
    next.keywords?.length ? `Work these search phrases in naturally, without stuffing: ${next.keywords.join('; ')}.` : '',
    next.brief || '',
    queue.localFacts?.length ? `VERIFIED LOCAL FACTS. Use the ones that fit this article; they are what makes it more useful than anything else online. When you use a number or a named place from this list, name the source in the sentence (for example "according to the City of Sioux Falls" or "SiouxFalls.Business reported in April 2026"). Do not state any other Sioux Falls specific numbers, prices, or names.\n- ${queue.localFacts.join('\n- ')}` : '',
    'Make it the most helpful page a Sioux Falls reader could find: specific steps, real local names, the questions to ask, the mistakes to avoid, and a clear next step. No filler.',
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
    const clusterDates = articleIndex.filter((a) => a.cluster === cluster).map((a) => a.publishedAt).filter(Boolean);
    const publishDate = planClusterSlot(clusterDates, chicagoToday(), queue.publishWeekdays || PUBLISH_WEEKDAYS, queue.firstPublishDate);
    const file = buildArticleFile({ draft: withImage, categorySlug, contentType: next.contentType, relatedBusinesses, publishDate, slug: next.slug, cluster, clusterRole: isPillar ? 'pillar' : 'support' });
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
    relatedBusinesses, cluster, clusterRole: isPillar ? 'pillar' : 'support',
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
  schedule: '7 * * * *', // hourly; it only writes when a series is running low
  background: true, // generation can take longer than the 10s synchronous limit
};
