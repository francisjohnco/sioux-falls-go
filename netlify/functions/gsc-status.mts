import { getStore } from '@netlify/blobs';

export default async (req: Request) => {
  const cookieHeader = req.headers.get('cookie') || '';
  if (!cookieHeader.includes('sfg_admin_session=')) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  try {
    const store = getStore('gsc-integration');
    const tokens = await store.get('tokens', { type: 'json' });
    return new Response(
      JSON.stringify({
        connected: !!tokens?.refresh_token,
        connectedAt: tokens?.connectedAt || null,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch {
    return new Response(JSON.stringify({ connected: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config = { path: '/api/gsc-status' };
