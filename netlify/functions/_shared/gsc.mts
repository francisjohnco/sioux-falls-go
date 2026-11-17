import { getStore } from '@netlify/blobs';

// Shared Google Search Console access: token refresh plus one query call.

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
  if (!res.ok) throw new Error('Search Console sign in expired. Reconnect it in Admin.');
  return data.access_token;
}

export type GscRow = { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number };

export async function gscClient(): Promise<((body: Record<string, unknown>) => Promise<GscRow[]>) | null> {
  const property = process.env.GSC_SITE_PROPERTY;
  const tokens: any = await getStore('gsc-integration').get('tokens', { type: 'json' });
  if (!property || !tokens?.refresh_token) return null;
  const token = await getAccessToken(tokens.refresh_token);
  return async (body) => {
    const res = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `Search Console error ${res.status}`);
    return data.rows || [];
  };
}

export const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const daysAgo = (n: number) => ymd(new Date(Date.now() - n * 86400000));
