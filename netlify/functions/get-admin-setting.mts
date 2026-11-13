import { getStore } from '@netlify/blobs';
import { isAdmin } from './_shared/auth.mts';

export default async (req: Request) => {
  const cookieHeader = req.headers.get('cookie') || '';
  if (!isAdmin(cookieHeader)) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  if (!key) {
    return new Response(JSON.stringify({ error: 'Missing key' }), { status: 400 });
  }

  const store = getStore('admin-settings');
  const value = await store.get(key);

  return new Response(JSON.stringify({ value: value ?? null }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = { path: '/api/get-admin-setting' };
