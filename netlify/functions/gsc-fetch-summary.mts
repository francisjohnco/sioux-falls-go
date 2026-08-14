// Site-wide search traffic totals for the Dashboard — real clicks and
// impressions from Google Search Console, not per-query detail (that's
// what gsc-fetch-opportunities.mts is for). Reuses the same proven
// token-refresh pattern.
//
// Uses a 28-day window rather than the 90-day window used elsewhere —
// this is meant to answer "what's happening lately," and GSC data has a
// real 2-3 day processing delay regardless of window size.

import { getStore } from '@netlify/blobs';

async function getAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

export default async (req: Request) => {
  const cookieHeader = req.headers.get('cookie') || '';
  if (!cookieHeader.includes('sfg_admin_session=')) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  const SITE_URL_PROPERTY = process.env.GSC_SITE_PROPERTY;
  if (!SITE_URL_PROPERTY) {
    return new Response(JSON.stringify({ error: 'GSC_SITE_PROPERTY not configured' }), { status: 500 });
  }

  try {
    const store = getStore('gsc-integration');
    const tokens = await store.get('tokens', { type: 'json' });
    if (!tokens?.refresh_token) {
      return new Response(JSON.stringify({ error: 'Search Console not connected' }), { status: 400 });
    }

    const accessToken = await getAccessToken(tokens.refresh_token);

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 28 * 86400000);
    const fmt = (d: Date) => d.toISOString().split('T')[0];

    const gscRes = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL_PROPERTY)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        // No dimensions = one aggregate row for the whole date range,
        // rather than summing up hundreds of per-query rows ourselves.
        body: JSON.stringify({ startDate: fmt(startDate), endDate: fmt(endDate) }),
      }
    );

    const gscData = await gscRes.json();
    if (!gscRes.ok) {
      return new Response(JSON.stringify({ error: 'Search Console query failed', detail: gscData }), { status: 502 });
    }

    const totals = gscData.rows?.[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };

    return new Response(
      JSON.stringify({
        dateRange: { start: fmt(startDate), end: fmt(endDate) },
        clicks: totals.clicks,
        impressions: totals.impressions,
        ctr: Math.round(totals.ctr * 1000) / 10, // as a percentage, one decimal
        avgPosition: Math.round(totals.position * 10) / 10,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Fetch failed', detail: String(err?.message || err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config = { path: '/api/gsc-fetch-summary' };
