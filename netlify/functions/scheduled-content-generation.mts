import { getStore } from '@netlify/blobs';

// This is a Netlify SCHEDULED function — the cron schedule below controls
// when it runs automatically. "0 14 * * 1,3" = 2pm UTC every Monday and
// Wednesday (the rotating pattern requested). Change the cron string to
// adjust the schedule; no code change needed elsewhere.
//
// This function NEVER auto-publishes. It generates a draft and puts it in
// the "pending review" queue (Netlify Blobs) — a human still has to open
// the admin dashboard and hit Approve. That's a deliberate quality gate,
// not a limitation: "every content must be the best in topic" (your words)
// isn't compatible with fully unsupervised publishing.

export default async () => {
  const siteUrl = process.env.URL || process.env.DEPLOY_URL;
  if (!siteUrl) {
    return new Response('Missing site URL env var', { status: 500 });
  }

  // 1. Fetch the current gap report (generated at every build by
  //    scripts/generate-content-index.mjs, served as a static asset)
  const gapsRes = await fetch(`${siteUrl}/content-gaps.json`);
  if (!gapsRes.ok) return new Response('Could not fetch content-gaps.json', { status: 500 });
  const gaps = await gapsRes.json();

  const topGap = gaps.categories.find((c: any) => c.priorityScore > 0);
  if (!topGap) {
    console.log('No positive-priority content gaps right now — nothing to generate.');
    return new Response('Nothing to do', { status: 200 });
  }

  // 2. Call the same generation endpoint the admin UI uses, internally.
  // The content type to generate comes straight from the real gap report
  // (topGap.missingTypes), not a hardcoded guess — for service categories
  // this picks the first missing required type; for dual/other categories
  // it defaults to a general local-resource piece.
  const contentTypeToGenerate =
    topGap.categoryType === 'service' && topGap.missingTypes?.length > 0
      ? topGap.missingTypes[0]
      : topGap.categoryType === 'dual'
      ? 'local-resource'
      : 'local-resource';

  const draftRes = await fetch(`${siteUrl}/api/generate-draft`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Scheduled functions run server-side with no user cookie — this
      // internal call authenticates via a shared secret instead. See
      // INTERNAL_FUNCTION_TOKEN in the setup docs.
      'x-internal-token': process.env.INTERNAL_FUNCTION_TOKEN || '',
    },
    body: JSON.stringify({
      categoryName: topGap.name,
      categorySlug: topGap.slug,
      contentType: contentTypeToGenerate,
      promptTemplate: 'Scheduled auto-generation',
      existingArticleTitles: [],
    }),
  });

  if (!draftRes.ok) {
    const detail = await draftRes.text();
    console.error('Draft generation failed:', detail);
    return new Response('Generation failed', { status: 500 });
  }

  const { draft } = await draftRes.json();

  // 3. Store in the pending-review queue — NOT published yet
  const store = getStore('pending-drafts');
  const id = `${topGap.slug}-${Date.now()}`;
  await store.setJSON(id, {
    id,
    categorySlug: topGap.slug,
    categoryName: topGap.name,
    contentType: contentTypeToGenerate,
    draft,
    generatedAt: new Date().toISOString(),
    status: 'pending-review',
  });

  console.log(`Generated draft "${draft.title}" for ${topGap.name}, queued for review as ${id}`);
  return new Response(`Generated draft for ${topGap.name}: ${draft.title}`, { status: 200 });
};

export const config = {
  schedule: '0 14 * * 1,3', // 2pm UTC, Monday and Wednesday
};
