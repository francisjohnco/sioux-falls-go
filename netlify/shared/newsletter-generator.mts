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
  // Only inspect the most recently-modified files, not all 98+ — GitHub's
  // list endpoint doesn't sort by date, so pull a reasonable batch and
  // filter by the actual publishedAt frontmatter after reading each one.
  const mdFiles = files.filter((f) => f.name.endsWith('.md'));

  for (const file of mdFiles) {
    const contentRes = await fetch(
      `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${file.path}`,
      { headers }
    );
    if (!contentRes.ok) continue;
    const data = await contentRes.json();
    const raw = Buffer.from(data.content, 'base64').toString('utf-8');

    const titleMatch = raw.match(/^title:\s*"(.+?)"\s*$/m);
    const descMatch = raw.match(/description:\s*"(.+?)"\s*$/m);
    const dateMatch = raw.match(/publishedAt:\s*"?(\d{4}-\d{2}-\d{2})"?/m);
    if (!titleMatch || !dateMatch) continue;

    const publishDate = new Date(dateMatch[1]);
    if (sinceDate && publishDate <= sinceDate) continue;

    articles.push({
      title: titleMatch[1],
      description: descMatch?.[1] || '',
      slug: file.name.replace(/\.md$/, ''),
      date: dateMatch[1],
    });
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
    system: `You write the Sioux Falls Go email newsletter. Warm, local, brief — this is an email people skim, not an article. Output ONLY valid JSON, no markdown fences: {"subject": "string, under 60 characters", "html": "string, simple inline-styled HTML email body"}`,
    messages: [
      {
        role: 'user',
        content: `Recent Sioux Falls Go articles to feature:\n${articleList}\n\nAlso include a line inviting readers to check the full real-time events calendar at https://sioux-falls-go.netlify.app/events. Keep the whole email short — a friendly opener, 2-4 short article blurbs with links, an events mention, sign-off.`,
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  const parsed = JSON.parse(textBlock?.type === 'text' ? textBlock.text : '{}');
  return { subject: parsed.subject, html: parsed.html };
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
  const current = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf-8'));
  current.lastGeneratedAt = new Date().toISOString();

  await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Update newsletter lastGeneratedAt [skip ci]',
      content: Buffer.from(JSON.stringify(current, null, 2) + '\n').toString('base64'),
      sha: fileData.sha,
    }),
  });
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
