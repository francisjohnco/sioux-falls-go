// Sends one plain-text email through Resend (resend.com).
// Env vars:
//   RESEND_API_KEY        from resend.com, after verifying the sending domain
//   OUTREACH_FROM_EMAIL   e.g. "Francis at Sioux Falls Go <francis@siouxfallsgo.com>"
//   OUTREACH_REPLY_TO     optional, where owner replies should land (your inbox)
// Returns { ok: false, notConfigured: true } when the keys are not set, so
// callers can fall back to opening the email in the admin's own mail app.

export function emailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.OUTREACH_FROM_EMAIL);
}

export async function sendEmail(to: string, subject: string, text: string): Promise<{ ok: boolean; notConfigured?: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.OUTREACH_FROM_EMAIL;
  if (!key || !from) return { ok: false, notConfigured: true };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text, ...(process.env.OUTREACH_REPLY_TO ? { reply_to: process.env.OUTREACH_REPLY_TO } : {}) }),
  });
  if (res.ok) return { ok: true };
  const data: any = await res.json().catch(() => ({}));
  return { ok: false, error: data?.message || `Email service error ${res.status}` };
}
