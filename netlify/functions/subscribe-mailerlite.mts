// Env vars required:
//   MAILERLITE_API_KEY  — from MailerLite dashboard, Integrations > API
//   MAILERLITE_GROUP_ID — the numeric ID of the group new signups should join
//
// Receives {name, email} from the Local Legend VIP form on the directory
// page and adds them as a real MailerLite subscriber. The API key never
// reaches the browser — this function is the only thing that talks to
// MailerLite directly, same security pattern as every other integration
// on this site (GitHub token, Google Places key, etc. all stay server-side).
//
// MailerLite's own docs note that POSTing an email that already exists is
// non-destructive — it just updates that subscriber's fields/groups rather
// than erroring, so this is safe to call more than once for the same person.

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const { MAILERLITE_API_KEY, MAILERLITE_GROUP_ID } = process.env;
  if (!MAILERLITE_API_KEY || !MAILERLITE_GROUP_ID) {
    return new Response(
      JSON.stringify({ error: 'MAILERLITE_API_KEY / MAILERLITE_GROUP_ID not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const body = await req.json().catch(() => null);
  const email: string | undefined = body?.email;
  const name: string | undefined = body?.name;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ error: 'A valid email is required' }), { status: 400 });
  }

  try {
    const res = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MAILERLITE_API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        email,
        fields: name ? { name } : undefined,
        groups: [MAILERLITE_GROUP_ID],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: data.message || 'MailerLite rejected the request', detail: data }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 500 });
  }
};

export const config = { path: '/api/subscribe-local-legend' };
