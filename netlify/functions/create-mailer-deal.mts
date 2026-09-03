// Env vars required (same as the other admin functions):
//   GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO
//
// Creates a brand-new deal file in src/content/deals/ — used specifically
// for the "a business just booked a postcard spot" moment. Once this file
// exists with mailerCampaign set, everything downstream (the redemption
// page, the Mailer Deals hub, the business's Postcard Offer tab) is
// generated automatically at build time — this function is the one real
// manual step that kicks that whole chain off.

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const cookieHeader = req.headers.get('cookie') || '';
  if (!cookieHeader.includes('sfg_admin_session=')) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    return new Response(
      JSON.stringify({ error: 'GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.business || !body?.title || !body?.mailerCampaign) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: business, title, mailerCampaign' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const {
    business,
    title,
    description,
    discountType,
    valueScore,
    expiresAt,
    terms,
    mailerCampaign,
  } = body;

  const deal: Record<string, unknown> = {
    business,
    title,
    description: description || '',
    discountType: discountType || 'other',
    valueScore: typeof valueScore === 'number' ? valueScore : 50,
    submittedBy: 'verified-by-team',
    mailerCampaign,
  };
  if (expiresAt) deal.expiresAt = expiresAt;
  if (terms) deal.terms = terms;

  const filename = `${business}-postcard-${slugify(mailerCampaign)}.json`;
  const path = `src/content/deals/${filename}`;
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;

  try {
    // Check whether a deal already exists at this exact path — GitHub's
    // API needs the file's sha to overwrite, and silently overwriting an
    // existing mailer deal for the same business+campaign is usually a
    // mistake (most likely: someone clicked twice), so surface it instead.
    const existing = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
    });
    if (existing.ok) {
      return new Response(
        JSON.stringify({ error: `A deal already exists for ${business} in the "${mailerCampaign}" mailing. Edit or remove it first.` }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const fileContent = JSON.stringify(deal, null, 2) + '\n';

    const res = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
      },
      body: JSON.stringify({
        message: `Admin: create mailer deal for ${business} (${mailerCampaign})`,
        content: Buffer.from(fileContent).toString('base64'),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ error: 'GitHub commit failed', detail: errText }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, path, redeemUrl: `/mailer-deals/${business}` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Create failed', detail: String(err?.message || err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config = { path: '/api/create-mailer-deal' };
