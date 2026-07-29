// Step 2 of the OAuth flow: Google redirects here after the admin approves
// access. Exchange the authorization code for tokens, store the durable
// refresh_token in Netlify Blobs (server-side only, never sent to the
// browser), and send the admin back to the dashboard.

import { getStore } from '@netlify/blobs';

export default async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return Response.redirect(`${url.origin}/admin?gsc=denied`, 302);
  }

  const cookieHeader = req.headers.get('cookie') || '';
  const stateMatch = cookieHeader.match(/gsc_oauth_state=([^;]+)/);
  const savedState = stateMatch ? stateMatch[1] : null;

  if (!code || !state || state !== savedState) {
    return Response.redirect(`${url.origin}/admin?gsc=error&reason=state_mismatch`, 302);
  }

  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const siteUrl = process.env.URL || process.env.DEPLOY_URL;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return Response.redirect(`${url.origin}/admin?gsc=error&reason=not_configured`, 302);
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: `${siteUrl}/api/gsc-auth-callback`,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.refresh_token) {
      // If this fires on a re-connect, it's usually because Google only
      // issues a refresh_token the first time an app is authorized. The
      // "prompt: consent" param in gsc-auth-start.mts forces it every time,
      // so this should be rare.
      return Response.redirect(`${url.origin}/admin?gsc=error&reason=no_refresh_token`, 302);
    }

    const store = getStore('gsc-integration');
    await store.setJSON('tokens', {
      refresh_token: tokens.refresh_token,
      connectedAt: new Date().toISOString(),
    });

    return new Response(null, {
      status: 302,
      headers: {
        Location: `${url.origin}/admin?gsc=connected`,
        'Set-Cookie': 'gsc_oauth_state=; Path=/; Max-Age=0', // clear the state cookie
      },
    });
  } catch (err: any) {
    return Response.redirect(`${url.origin}/admin?gsc=error&reason=${encodeURIComponent(String(err?.message || err))}`, 302);
  }
};

export const config = { path: '/api/gsc-auth-callback' };
