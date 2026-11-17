import Anthropic from '@anthropic-ai/sdk';
import { getStore } from '@netlify/blobs';
import { isAdmin, verifyToken } from './_shared/auth.mts';
import { readText, commitTextFiles } from './_shared/git-batch.mts';
import { chicagoToday } from './_shared/schedule.mts';

// Writes each category page's own content: a short local intro, what to look
// for when hiring, and 5 to 6 questions people search, each with a direct
// answer. Busiest categories first, a few per run, so every category page
// stops being a template. Also replaces the old one-line search description.

const SITE = 'https://siouxfallsgo.com';
const PER_RUN = 6;
const TIME_BUDGET_MS = 12 * 60 * 1000;

const RULES = `You write category pages for Sioux Falls Go, a local directory of locally owned businesses in Sioux Falls, South Dakota.

Write the content for ONE category page. The reader is a Sioux Falls resident deciding who to hire or visit.

ACCURACY
- Never invent numbers, prices, statistics, laws, license rules, business names, or awards. If you were given verified local facts, you may use them and name the source. Otherwise speak generally and tell the reader what to ask.
- Never name or recommend any specific business.
- Local detail must be true and general: Sioux Falls winters, freeze and thaw, wind, clay soil, hard water, the Big Sioux River, named areas like downtown, McKennan Park, or the suburbs of Brandon, Harrisburg, and Tea, only where they actually matter for this category.

STYLE
- Warm, specific, useful, never salesy. Address the reader as "you". No em dashes or en dashes anywhere. No cliches.

OUTPUT exactly this format, nothing else:
SEO_DESCRIPTION: <140 to 155 characters. Start with "Compare top-rated" or a concrete benefit, include the category and Sioux Falls, say what the reader gets (for example hours, phone numbers, reviews, local guides). No promises the page cannot keep.>
INTRO: <two short paragraphs separated by a blank line, 80 to 130 words total: what this service is for in Sioux Falls, when people need it, and what makes a good one here.>
TIP: <one sentence on what to look for or ask when choosing, specific to this category>
TIP: <...>
TIP: <...>
TIP: <...>
Q: <a question people actually type into Google about this category in Sioux Falls, phrased naturally>
A: <a direct answer in 2 or 3 sentences, answer first>
(5 or 6 Q and A pairs in total)`;

function parse(raw: string) {
  const clean = (t: string) => t.replace(/\s*[\u2013\u2014]\s*/g, ', ').trim();
  const desc = raw.match(/^SEO_DESCRIPTION:\s*(.+)$/m)?.[1];
  const introM = raw.match(/^INTRO:\s*([\s\S]*?)(?=^TIP:)/m);
  const tips = [...raw.matchAll(/^TIP:\s*(.+)$/gm)].map((m) => clean(m[1]));
  const faqs = [...raw.matchAll(/^Q:\s*(.+)\n+A:\s*([\s\S]+?)(?=\n+Q:|\s*$)/gm)].map((m) => ({ q: clean(m[1]), a: clean(m[2]) }));
  if (!introM || tips.length < 3 || faqs.length < 4) throw new Error('The writer returned an incomplete page.');
  return { description: desc ? clean(desc).slice(0, 160) : '', intro: clean(introM[1]), tips: tips.slice(0, 5), faqs: faqs.slice(0, 6) };
}

export default async (req: Request) => {
  const cookie = req.headers.get('cookie') || '';
  if (!isAdmin(cookie) && verifyToken(req.headers.get('x-sfg-task')) !== 'category-content') return new Response('Not authorized', { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return new Response('No ANTHROPIC_API_KEY', { status: 500 });

  const store = getStore('category-content');
  const prev: any = (await store.get('status', { type: 'json' })) || {};
  if (prev.running && Date.now() - Date.parse(prev.startedAt) < 14 * 60 * 1000) return new Response('Already running');
  await store.setJSON('status', { ...prev, running: true, startedAt: new Date().toISOString() });

  const started = Date.now();
  const log: string[] = [];
  let done = 0, remaining = 0;
  try {
    const cats: any[] = await fetch(`${SITE}/category-index.json`).then((r) => (r.ok ? r.json() : []));
    const queue = await fetch(`${SITE}/topic-queue.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const factsFor = (slug: string): string[] => ((queue?.queues || []).find((q: any) => q.category === slug)?.localFacts) || [];
    const todo = cats.filter((c) => !c.hasIntro && (c.businesses > 0 || c.articles > 0)).sort((a, b) => b.businesses - a.businesses || b.articles - a.articles);
    remaining = todo.length;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const files: { path: string; content: string }[] = [];

    for (const c of todo.slice(0, PER_RUN)) {
      if (Date.now() - started > TIME_BUDGET_MS) break;
      try {
        const path = `src/content/categories/${c.slug}.json`;
        const raw = await readText(path);
        if (!raw) continue;
        const cat = JSON.parse(raw);
        const facts = factsFor(c.slug);
        const material = [
          `Category: ${c.name}`,
          c.parentName ? `Part of: ${c.parentName}` : '',
          `Listed businesses: ${c.businesses}`,
          facts.length ? `VERIFIED LOCAL FACTS you may use (name the source when you use a number):\n- ${facts.join('\n- ')}` : '',
        ].filter(Boolean).join('\n');
        const msg = await anthropic.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 1800, system: RULES, messages: [{ role: 'user', content: material }] });
        const text = (msg.content.find((b: any) => b.type === 'text') as any)?.text || '';
        const out = parse(text);
        cat.intro = out.intro;
        cat.tips = out.tips;
        cat.faqs = out.faqs;
        cat.contentUpdatedAt = chicagoToday();
        const generic = /^(find trusted|discover|sioux falls )/i.test(cat.seo?.description || '') || (cat.seo?.description || '').length < 90;
        if (generic && out.description.length >= 100) cat.seo.description = out.description;
        files.push({ path, content: JSON.stringify(cat, null, 2) + '\n' });
        log.push(`Wrote: ${c.name}`);
        done++;
      } catch (err: any) {
        log.push(`Error on ${c.name}: ${err?.message || err}`);
      }
    }
    if (files.length) await commitTextFiles(files, `Category pages: ${files.length} written`);
    await store.setJSON('status', { running: false, lastRun: new Date().toISOString(), lastDone: done, remaining: Math.max(0, remaining - done), log: [...log, ...(prev.log || [])].slice(0, 40) });
  } catch (err: any) {
    await store.setJSON('status', { running: false, lastRun: new Date().toISOString(), error: err?.message || String(err), log: [...log, ...(prev.log || [])].slice(0, 40) });
  }
  return new Response('done');
};

export const config = { path: '/api/category-content-background', background: true };
