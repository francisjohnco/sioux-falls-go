// Phase 2 of the content gap system: real search demand data.
// Uses the stored refresh_token to get a fresh access_token, queries the
// Search Console Search Analytics API for real query/impression/position
// data, and layers "search opportunity" scoring on top of the Phase 1
// static gap report (scripts/generate-content-index.mjs / content-gaps.json).
//
// Search opportunity signal: a query with meaningful impressions but a
// poor average position (page 2+, roughly position > 10) or a low
// click-through rate relative to its position means real people are
// searching for it and not finding a good answer on the site yet — a
// genuine content gap the static file-count analysis can't see.

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
  const internalToken = req.headers.get('x-internal-token');
  const hasValidCookie = cookieHeader.includes('sfg_admin_session=');
  const hasValidInternalToken =
    internalToken && process.env.INTERNAL_FUNCTION_TOKEN && internalToken === process.env.INTERNAL_FUNCTION_TOKEN;
  if (!hasValidCookie && !hasValidInternalToken) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  const SITE_URL_PROPERTY = process.env.GSC_SITE_PROPERTY; // e.g. "https://siouxfallsgo.com/" or "sc-domain:siouxfallsgo.com"
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
    const startDate = new Date(endDate.getTime() - 90 * 86400000); // last 90 days
    const fmt = (d: Date) => d.toISOString().split('T')[0];

    const gscRes = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL_PROPERTY)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: fmt(startDate),
          endDate: fmt(endDate),
          dimensions: ['query'],
          rowLimit: 250,
        }),
      }
    );

    const gscData = await gscRes.json();
    if (!gscRes.ok) {
      return new Response(JSON.stringify({ error: 'Search Console query failed', detail: gscData }), { status: 502 });
    }

    // Real opportunity scoring: meaningful impressions, weak position
    const opportunities = (gscData.rows || [])
      .filter((r: any) => r.impressions >= 10 && r.position > 10)
      .map((r: any) => ({
        query: r.keys[0],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: Math.round(r.position * 10) / 10,
        opportunityScore: Math.round(r.impressions * (r.position / 10)),
      }))
      .sort((a: any, b: any) => b.opportunityScore - a.opportunityScore);

    return new Response(
      JSON.stringify({
        fetchedAt: new Date().toISOString(),
        dateRange: { start: fmt(startDate), end: fmt(endDate) },
        totalQueries: gscData.rows?.length || 0,
        opportunities: opportunities.slice(0, 30),
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

export const config = { path: '/api/gsc-fetch-opportunities' };
