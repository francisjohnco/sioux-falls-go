import { getStore } from '@netlify/blobs';

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const cookieHeader = req.headers.get('cookie') || '';
  if (!cookieHeader.includes('sfg_admin_session=')) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.key || typeof body.value !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing key or value' }), { status: 400 });
  }

  const store = getStore('admin-settings');
  await store.set(body.key, body.value);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = { path: '/api/save-admin-setting' };
