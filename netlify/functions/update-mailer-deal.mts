// Env vars required (same as the other admin functions):
//   GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO
//
// Edits or deletes an existing mailer deal file — this is the counterpart
// to create-mailer-deal.mts, which could only ever create new files. Real
// deals need real correction over time: the business can change, the offer
// can change, the price tier can change, and a deal that's wrong needs to
// be removable, not just left to expire.

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
  if (!body?.dealId) {
    return new Response(JSON.stringify({ error: 'Missing required field: dealId' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const path = `src/content/deals/${body.dealId}.json`;
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
  const authHeaders = { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' };

  try {
    // Every edit and delete needs the file's current sha first — GitHub
    // requires it to prove we're not blindly overwriting someone else's
    // concurrent change.
    const existing = await fetch(apiUrl, { headers: authHeaders });
    if (!existing.ok) {
      return new Response(JSON.stringify({ error: `Deal file not found: ${body.dealId}` }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }
    const existingData = await existing.json();
    const sha = existingData.sha;

    if (body.delete) {
      const res = await fetch(apiUrl, {
        method: 'DELETE',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Admin: delete mailer deal ${body.dealId}`,
          sha,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        return new Response(JSON.stringify({ error: 'GitHub delete failed', detail: errText }), {
          status: 502, headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true, deleted: body.dealId }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Edit: rebuild the deal object from scratch with the submitted values
    // rather than patching individual fields — every field on this form
    // is meant to be fully editable (business, offer, price tier, dates),
    // so a clean rewrite is simpler and less error-prone than field-by-field
    // JSON surgery.
    const {
      business, title, description, discountType, valueScore,
      expiresAt, activatesAt, terms, mailerCampaign, spotSize,
    } = body;

    if (!business || !title || !mailerCampaign) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: business, title, mailerCampaign' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const deal: Record<string, unknown> = {
      business,
      title,
      description: description || '',
      discountType: discountType || 'other',
      valueScore: typeof valueScore === 'number' ? valueScore : 50,
      submittedBy: 'verified-by-team',
      mailerCampaign,
    };
    if (spotSize) deal.spotSize = spotSize;
    if (activatesAt) deal.activatesAt = activatesAt;
    if (expiresAt) deal.expiresAt = expiresAt;
    if (terms) deal.terms = terms;

    const fileContent = JSON.stringify(deal, null, 2) + '\n';

    const res = await fetch(apiUrl, {
      method: 'PUT',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Admin: edit mailer deal ${body.dealId}`,
        content: Buffer.from(fileContent).toString('base64'),
        sha,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ error: 'GitHub commit failed', detail: errText }), {
        status: 502, headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, path }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Update failed', detail: String(err?.message || err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config = { path: '/api/update-mailer-deal' };
