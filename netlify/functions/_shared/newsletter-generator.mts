// Env vars required:
//   GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO — to read recent article files
//   ANTHROPIC_API_KEY — to draft the newsletter copy
//   MAILERLITE_API_KEY, MAILERLITE_GROUP_ID — to create the draft campaign
//
// This is shared logic, not its own endpoint — called by both
// generate-newsletter.mts (manual "Generate Now" button in admin) and
// newsletter-check-scheduled.mts (the daily automated check). Kept in one
// place so the two call sites can't drift out of sync with each other.
//
// Deliberately creates a DRAFT campaign in MailerLite, never sends
// automatically. AI-drafted copy going out to a real subscriber list
// unreviewed is a meaningfully bigger risk than an article draft sitting
// in a queue, so a human always has to open MailerLite and hit send.

import Anthropic from '@anthropic-ai/sdk';

const GITHUB_API = 'https://api.github.com';

interface ArticleSummary {
  title: string;
  description: string;
  slug: string;
  date: string;
}

async function githubHeaders() {
  const { GITHUB_TOKEN } = process.env;
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
  };
}

async function getRecentArticles(sinceDate: Date | null): Promise<ArticleSummary[]> {
  const { GITHUB_OWNER, GITHUB_REPO } = process.env;
  const headers = await githubHeaders();

  const listRes = await fetch(
    `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/src/content/articles`,
    { headers }
  );
  if (!listRes.ok) throw new Error(`Failed to list articles: ${listRes.status}`);
  const files: { name: string; path: string }[] = await listRes.json();

  const articles: ArticleSummary[] = [];
  const mdFiles = files.filter((f) => f.name.endsWith('.md'));

  // Fetch all article contents in parallel rather than one at a time —
  // ~98 sequential round-trips risked exceeding Netlify's function
  // execution timeout, which would silently produce an empty article
  // list with no visible error. GitHub allows up to 100 concurrent
  // requests, so fetching the whole batch at once is safely within that.
  const results = await Promise.all(
    mdFiles.map(async (file) => {
      const contentRes = await fetch(
        `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${file.path}`,
        { headers }
      );
      if (!contentRes.ok) return null;
      const data = await contentRes.json();
      const raw = Buffer.from(data.content, 'base64').toString('utf-8');

      const titleMatch = raw.match(/^title:\s*"(.+?)"\s*$/m);
      // Real articles nest description under seo:, not as a top-level field
      const descMatch = raw.match(/^\s*description:\s*"(.+?)"\s*$/m);
      const dateMatch = raw.match(/publishedAt:\s*"?(\d{4}-\d{2}-\d{2})"?/m);
      if (!titleMatch || !dateMatch) return null;

      const publishDate = new Date(dateMatch[1]);
      if (sinceDate && publishDate <= sinceDate) return null;

      return {
        title: titleMatch[1],
        description: descMatch?.[1] || '',
        slug: file.name.replace(/\.md$/, ''),
        date: dateMatch[1],
      };
    })
  );

  for (const r of results) {
    if (r) articles.push(r);
  }

  return articles.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
}

async function draftNewsletterCopy(articles: ArticleSummary[]): Promise<{ subject: string; html: string }> {
  const { ANTHROPIC_API_KEY } = process.env;
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const articleList = articles.length > 0
    ? articles.map((a) => `- "${a.title}" (${a.description}) — https://sioux-falls-go.netlify.app/guides/${a.slug}`).join('\n')
    : 'No new articles published since the last newsletter — lead with the events calendar instead.';

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    // Deliberately not asking for JSON here — the HTML body naturally
    // contains unescaped quotes (style="...") and can include characters
    // that break JSON string parsing even with clear instructions. A
    // plain delimiter is far more reliable for this kind of output.
    system: `You write the Sioux Falls Go email newsletter. Warm, local, brief — this is an email people skim, not an article. Respond in exactly this format, nothing else:

SUBJECT: <subject line, under 60 characters>
---BODY---
<simple inline-styled HTML email body>`,
    messages: [
      {
        role: 'user',
        content: `Recent Sioux Falls Go articles to feature:\n${articleList}\n\nAlso include a line inviting readers to check the full real-time events calendar at https://sioux-falls-go.netlify.app/events. Keep the whole email short — a friendly opener, 2-4 short article blurbs with links, an events mention, sign-off.`,
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  const raw = textBlock?.type === 'text' ? textBlock.text : '';

  const subjectMatch = raw.match(/^SUBJECT:\s*(.+?)\s*$/m);
  const bodyIdx = raw.indexOf('---BODY---');
  if (!subjectMatch || bodyIdx === -1) {
    throw new Error(`Newsletter draft response didn't match the expected format. Got: ${raw.slice(0, 200)}`);
  }

  const subject = subjectMatch[1].trim();
  const html = raw.slice(bodyIdx + '---BODY---'.length).trim();
  return { subject, html };
}

async function createMailerLiteDraft(subject: string, html: string): Promise<{ id: string }> {
  const { MAILERLITE_API_KEY, MAILERLITE_GROUP_ID } = process.env;

  const res = await fetch('https://connect.mailerlite.com/api/campaigns', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MAILERLITE_API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      name: `Auto-draft: ${subject}`,
      type: 'regular',
      emails: [
        {
          subject,
          from_name: 'Sioux Falls Go',
          from: 'hello@siouxfallsgo.com',
          content: html,
        },
      ],
      groups: [MAILERLITE_GROUP_ID],
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`MailerLite rejected the campaign: ${data.message || JSON.stringify(data)}`);
  }
  return { id: data.data?.id };
}

async function updateLastGeneratedAt(): Promise<void> {
  const { GITHUB_OWNER, GITHUB_REPO } = process.env;
  const headers = await githubHeaders();
  const path = 'data/newsletter-config.json';

  const getRes = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, { headers });
  const fileData = await getRes.json();
  const rawContent = Buffer.from(fileData.content, 'base64').toString('utf-8');

  let current;
  try {
    current = JSON.parse(rawContent);
  } catch {
    throw new Error(`data/newsletter-config.json is currently malformed on GitHub and needs a manual fix. Raw content: ${rawContent.slice(0, 200)}`);
  }
  current.lastGeneratedAt = new Date().toISOString();

  // Sanity-check before writing — never send GitHub something that
  // wouldn't parse back as valid JSON, regardless of the source state.
  const newContent = JSON.stringify(current, null, 2) + '\n';
  JSON.parse(newContent);

  const putRes = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Update newsletter lastGeneratedAt [skip ci]',
      content: Buffer.from(newContent).toString('base64'),
      sha: fileData.sha,
    }),
  });
  if (!putRes.ok) {
    const putError = await putRes.json().catch(() => ({}));
    throw new Error(`GitHub write failed: ${putRes.status}${putRes.status === 409 ? ' (a conflicting save happened at the same moment)' : ''} ${putError.message || ''}`);
  }
}

export async function generateAndDraftNewsletter(lastGeneratedAt: string | null): Promise<{
  ok: boolean;
  campaignId?: string;
  articleCount: number;
  error?: string;
}> {
  const required = ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO', 'ANTHROPIC_API_KEY', 'MAILERLITE_API_KEY', 'MAILERLITE_GROUP_ID'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    return { ok: false, articleCount: 0, error: `Missing env vars: ${missing.join(', ')}` };
  }

  try {
    const sinceDate = lastGeneratedAt ? new Date(lastGeneratedAt) : null;
    const articles = await getRecentArticles(sinceDate);
    const { subject, html } = await draftNewsletterCopy(articles);
    const campaign = await createMailerLiteDraft(subject, html);
    // Only advance the "last generated" timestamp when real articles were
    // actually found and used — a 0-article result means nothing genuinely
    // happened, and advancing the timestamp anyway would poison every
    // future comparison, silently excluding real older articles forever.
    if (articles.length > 0) {
      await updateLastGeneratedAt();
    }
    return { ok: true, campaignId: campaign.id, articleCount: articles.length };
  } catch (err: any) {
    return { ok: false, articleCount: 0, error: String(err?.message || err) };
  }
}
