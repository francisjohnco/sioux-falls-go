// Rebuilds the site by making one small commit. Netlify rebuilds on every
// push to main, and the GitHub credentials the other admin functions already
// use are all this needs, so there is no build hook to create or keep secret.
// A rebuild is what makes scheduled articles go live, drops events that have
// passed, and expires old deals.

export async function triggerRefresh(reason: string): Promise<void> {
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) throw new Error('GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO not configured');
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/last-refresh.json`;
  const headers = { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' };

  let sha: string | undefined;
  const current = await fetch(url, { headers });
  if (current.ok) sha = (await current.json()).sha;

  const content = JSON.stringify({ lastRefresh: new Date().toISOString(), reason }, null, 2) + '\n';
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `Site refresh (${reason})`, content: Buffer.from(content).toString('base64'), sha }),
  });
  if (!res.ok) throw new Error(`GitHub refresh commit failed: ${res.status} ${await res.text()}`);
}
