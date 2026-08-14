// Step 1 of the OAuth flow: redirect the admin to Google's consent screen.
// Env vars required (one-time setup in Google Cloud Console — see
// docs/content-strategy.md "Connecting Search Console" section):
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET   (used in the callback, not here)

import crypto from 'node:crypto';

export default async (req: Request) => {
  const cookieHeader = req.headers.get('cookie') || '';
  if (!cookieHeader.includes('sfg_admin_session=')) {
    return new Response('Not authenticated', { status: 401 });
  }

  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  if (!GOOGLE_CLIENT_ID) {
    return new Response('GOOGLE_CLIENT_ID not configured — see setup docs', { status: 500 });
  }

  const siteUrl = process.env.URL || process.env.DEPLOY_URL;
  const redirectUri = `${siteUrl}/api/gsc-auth-callback`;

  // Temporary debug mode — visit gsc-auth-start?debug=1 to see the exact
  // redirect_uri our code sends, for comparing character-by-character
  // against what's registered in Google Cloud Console. No secrets exposed.
  const reqUrl = new URL(req.url);
  if (reqUrl.searchParams.get('debug') === '1') {
    return new Response(JSON.stringify({ siteUrl, redirectUri }, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const state = crypto.randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    access_type: 'offline', // required to get a refresh_token back
    prompt: 'consent',      // forces refresh_token on every connect, not just the first time
    state,
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  // Store state briefly to verify on callback (CSRF protection)
  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl,
      'Set-Cookie': `gsc_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
};

export const config = { path: '/api/gsc-auth-start' };
