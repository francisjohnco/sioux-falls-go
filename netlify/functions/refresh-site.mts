import { triggerRefresh } from './_shared/refresh.mts';
import { isAdmin } from './_shared/auth.mts';

// The admin's "Refresh site now" button.
export default async (req: Request) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  const cookieHeader = req.headers.get('cookie') || '';
  if (!isAdmin(cookieHeader)) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  try {
    await triggerRefresh('manual');
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: '/api/refresh-site' };
