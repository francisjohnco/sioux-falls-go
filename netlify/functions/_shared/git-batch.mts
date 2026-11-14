import { explainGitHubError } from './article-file.mts';

// Commits many text files in ONE commit, so updating 15 articles triggers one
// site rebuild instead of 15.

async function gh(path: string, init: RequestInit = {}) {
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) throw new Error('GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO not configured');
  const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(explainGitHubError(res.status));
  return res.json();
}

export async function readText(path: string): Promise<string | null> {
  try {
    const d = await gh(`/contents/${path}`);
    return Buffer.from(d.content, 'base64').toString('utf-8');
  } catch (err: any) {
    if (/not found|404/i.test(err.message)) return null;
    throw err;
  }
}

export async function listFiles(dir: string): Promise<{ name: string; path: string }[]> {
  return gh(`/contents/${dir}`);
}

export async function commitTextFiles(files: { path: string; content: string }[], message: string): Promise<string> {
  if (!files.length) return '';
  const repo = await gh('');
  const branch = repo.default_branch || 'main';
  for (let attempt = 0; attempt < 3; attempt++) {
    const ref = await gh(`/git/ref/heads/${branch}`);
    const head = await gh(`/git/commits/${ref.object.sha}`);
    const tree = await gh('/git/trees', {
      method: 'POST',
      body: JSON.stringify({ base_tree: head.tree.sha, tree: files.map((f) => ({ path: f.path, mode: '100644', type: 'blob', content: f.content })) }),
    });
    const commit = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: tree.sha, parents: [ref.object.sha] }) });
    try {
      await gh(`/git/refs/heads/${branch}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) });
      return commit.sha;
    } catch (err) {
      if (attempt === 2) throw err; // someone else committed in between: retry on top of theirs
    }
  }
  return '';
}
