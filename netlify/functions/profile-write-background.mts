import Anthropic from '@anthropic-ai/sdk';
import { getStore } from '@netlify/blobs';
import { verifyToken } from './_shared/auth.mts';
import { readBusinessFile, readField } from './_shared/business-file.mts';
import { INTERVIEW_QUESTIONS } from '../../src/lib/interview-questions.ts';

// Writes a business profile story from the interview answers (and, when
// asked, the current story). Runs in the background because writing takes
// longer than a normal request is allowed to.

const RULES = `You write business profiles for Sioux Falls Go, a guide to locally owned Sioux Falls, South Dakota businesses.

Write the profile story for the business below. It should read like a well-reported local feature, written for the customer who is deciding whether to hire or visit this business.

STRUCTURE
- Open with one or two short paragraphs about the situation the customer is in before they find this business. No heading above the opening.
- Then 5 to 8 sections, each starting with a "## " subheading. Subheadings are specific, plain-spoken phrases that tell the reader what the section gives them (examples of the style: "Your Own Office, Four Hours at a Time", "Walk In and Start Seeing Clients Within Minutes", "Built for Confidential, Client-Facing Work"). No colons, no question marks, no em or en dashes in subheadings.
- Cover, where the answers allow: the owner's story, what is different, how it works step by step, what is included and starting prices, who it is for, standards and trust, and a closing section on how to get started (service area, hours, how to book).
- 600 to 1100 words. Short paragraphs of 2 to 4 sentences. Address the reader as "you".

ACCURACY (most important)
- Use only facts found in the interview answers or the current story. Never invent prices, dates, years, numbers, credentials, licenses, awards, names, customer stories, or quotes.
- If something is not in the material, leave it out. A shorter accurate profile is far better than a padded one.
- Refer to owners by the names given.

QUOTES
- Do not put quotes or blockquotes inside the story. Quotes are placed separately.
- PULL_QUOTE and OWNER_QUOTE must be copied word for word from something the owner actually said in the answers (their own words, not your summary). Each under 160 characters. If there is no quotable line, leave it empty.

STYLE
- Warm, specific, confident, never salesy. No cliches like "look no further", "in today's world", "second to none", "one stop shop".
- Never use em dashes or en dashes anywhere. Use commas, periods, or the word "to".
- Mention Sioux Falls naturally, not in every paragraph.

OUTPUT exactly this format and nothing else:
OWNER_NAME: <owner name(s) as given, or empty>
OWNER_ROLE: <owner's role or title as given, or empty>
PULL_QUOTE: <word for word owner quote, or empty>
OWNER_QUOTE: <a different word for word owner quote, or empty>
EXCERPT: <one or two sentences under 300 characters summarizing the business for a listing card>
---BODY---
<the story in markdown>`;

const line = (raw: string, key: string) => (raw.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'))?.[1] || '').trim().replace(/^["“]|["”]$/g, '').replace(/\s*[\u2013\u2014]\s*/g, ', ');

export default async (req: Request) => {
  if (verifyToken(req.headers.get('x-sfg-task')) !== 'profile-job') return new Response('Not authorized', { status: 401 });
  const { jobId, slug, useCurrent } = await req.json().catch(() => ({}));
  const jobs = getStore('profile-jobs');
  if (!jobId || !/^[a-z0-9-]+$/.test(slug || '')) return new Response('Bad request', { status: 400 });

  try {
    const saved: any = (await getStore('interview-answers').get(slug, { type: 'json' })) || { answers: {} };
    const f = await readBusinessFile(slug);
    const name = readField(f.frontmatter, 'name') || slug;
    const category = readField(f.frontmatter, 'category') || '';
    const answered = INTERVIEW_QUESTIONS.filter((q) => (saved.answers?.[q.id] || '').trim());
    if (!answered.length && !useCurrent) throw new Error('Add some interview answers first, or tick "Use the current story too".');

    const material = [
      `Business: ${name}`,
      `Category: ${category}`,
      answered.length ? `INTERVIEW ANSWERS\n${answered.map((q) => `Q: ${q.question}\nA: ${saved.answers[q.id].trim()}`).join('\n\n')}` : '',
      useCurrent ? `CURRENT STORY (facts from here may be used and reorganized)\n${f.body.trim()}` : '',
    ].filter(Boolean).join('\n\n');

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 4000, system: RULES, messages: [{ role: 'user', content: material }] });
    const raw = (msg.content.find((b: any) => b.type === 'text') as any)?.text || '';
    const at = raw.indexOf('---BODY---');
    if (at === -1) throw new Error('The writer did not return a story. Try again.');
    const body = raw.slice(at + 10).trim().replace(/\s*[\u2013\u2014]\s*/g, ', ').replace(/^#\s/gm, '## ');

    await jobs.setJSON(jobId, {
      status: 'done', slug,
      result: {
        body, ownerName: line(raw, 'OWNER_NAME'), ownerRole: line(raw, 'OWNER_ROLE'),
        pullQuote: line(raw, 'PULL_QUOTE'), ownerQuote: line(raw, 'OWNER_QUOTE'), excerpt: line(raw, 'EXCERPT'),
      },
      finishedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    await jobs.setJSON(jobId, { status: 'error', slug, error: err?.message || String(err) });
  }
  return new Response('ok');
};

export const config = { path: '/api/profile-write-background', background: true };
