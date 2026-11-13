import { getStore } from '@netlify/blobs';
import { isAdmin } from './_shared/auth.mts';

export default async (req: Request) => {
  const cookieHeader = req.headers.get('cookie') || '';
  if (!isAdmin(cookieHeader)) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  const store = getStore('pending-drafts');
  const { blobs } = await store.list();

  const drafts = await Promise.all(
    blobs.map(async ({ key }) => {
      const data = await store.get(key, { type: 'json' });
      return { id: key, ...data };
    })
  );

  drafts.sort((a: any, b: any) => (b.generatedAt || '').localeCompare(a.generatedAt || ''));

  return new Response(JSON.stringify({ drafts }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = { path: '/api/list-pending-drafts' };
