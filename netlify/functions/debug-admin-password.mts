// TEMPORARY diagnostic endpoint — reveals only metadata about the stored
// ADMIN_PASSWORD (never the value itself), to debug a login mismatch.
// Delete this file once the issue is resolved.

export default async (req) => {
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  const SESSION_SECRET = process.env.SESSION_SECRET;

  return new Response(JSON.stringify({
    adminPasswordIsSet: Boolean(ADMIN_PASSWORD),
    adminPasswordLength: ADMIN_PASSWORD ? ADMIN_PASSWORD.length : 0,
    adminPasswordHasLeadingWhitespace: ADMIN_PASSWORD ? /^\s/.test(ADMIN_PASSWORD) : null,
    adminPasswordHasTrailingWhitespace: ADMIN_PASSWORD ? /\s$/.test(ADMIN_PASSWORD) : null,
    adminPasswordFirstChar: ADMIN_PASSWORD ? ADMIN_PASSWORD[0] : null,
    adminPasswordLastChar: ADMIN_PASSWORD ? ADMIN_PASSWORD[ADMIN_PASSWORD.length - 1] : null,
    sessionSecretIsSet: Boolean(SESSION_SECRET),
    sessionSecretLength: SESSION_SECRET ? SESSION_SECRET.length : 0,
  }, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = { path: '/api/debug-admin-password' };
