// TEMPORARY diagnostic endpoint — reveals only whether each GitHub env var
// is present and its length, never the actual token value. Delete once
// the issue is resolved.

export default async (req) => {
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env;

  const info = {
    GITHUB_TOKEN: {
      isSet: Boolean(GITHUB_TOKEN),
      length: GITHUB_TOKEN?.length ?? 0,
      startsWithGhp: GITHUB_TOKEN?.startsWith('ghp_') ?? null,
      startsWithGithubPat: GITHUB_TOKEN?.startsWith('github_pat_') ?? null,
    },
    GITHUB_OWNER: {
      isSet: Boolean(GITHUB_OWNER),
      value: GITHUB_OWNER || null, // safe to show — this is public info (your username)
    },
    GITHUB_REPO: {
      isSet: Boolean(GITHUB_REPO),
      value: GITHUB_REPO || null, // safe to show — this is public info (repo name)
    },
  };

  // If the token is set, actually test it against GitHub's API to see if
  // it's valid and has the right permissions, not just "present."
  let liveTest = null;
  if (GITHUB_TOKEN && GITHUB_OWNER && GITHUB_REPO) {
    try {
      const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`, {
        headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
      });
      liveTest = {
        status: res.status,
        ok: res.ok,
        message: res.ok ? 'Token works and can see the repo' : (await res.json()).message,
      };
    } catch (err: any) {
      liveTest = { error: String(err?.message || err) };
    }
  } else {
    liveTest = { skipped: 'One or more vars missing, did not attempt live test' };
  }

  return new Response(JSON.stringify({ info, liveTest }, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = { path: '/api/debug-github-config' };
