import Anthropic from '@anthropic-ai/sdk';
import { findHeroPhoto } from './hero-photo.mts';

// Header photo fields for a new draft. Never throws: if no photo is found the
// article still renders with a category safety-net image, and the hourly
// photo finder tries again after it publishes.
export async function heroForDraft(a: { title: string; seoDescription?: string; category?: string; exclude?: Set<string> }) {
  try {
    const r = await findHeroPhoto({ title: a.title, description: a.seoDescription, category: a.category, exclude: a.exclude });
    if (r.kind === 'new') return { heroImage: r.choice.heroImage, heroImageAlt: r.choice.heroImageAlt, heroImageCredit: r.choice.heroImageCredit };
    console.warn(`No header photo for "${a.title}":`, r.kind === 'none' ? r.reason : '');
  } catch (err: any) {
    console.warn(`Header photo search failed for "${a.title}":`, err?.message || err);
  }
  return {};
}

export interface HeroImageResult {
  url: string;
  credit: { photographer: string; profileUrl: string };
}

export async function fetchHeroImage(query: string): Promise<HeroImageResult | null> {
  const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
  if (!UNSPLASH_ACCESS_KEY) return null; // no key configured — article publishes without a hero image rather than failing

  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const photo = data.results?.[0];
    if (!photo) return null;

    // Unsplash's API terms require attribution — photographer name and a
    // link back to their profile, not just using the image silently.
    return {
      url: `${photo.urls.raw}&w=1600&fit=max&q=80`,
      credit: {
        photographer: photo.user?.name || 'Unsplash',
        profileUrl: `${photo.user?.links?.html || 'https://unsplash.com'}?utm_source=sioux_falls_go&utm_medium=referral`,
      },
    };
  } catch {
    return null; // image sourcing is a nice-to-have, never block publishing over it
  }
}

export const SYSTEM_PROMPT = `You are the Content Engine for Sioux Falls Go, a local business directory and knowledge platform for Sioux Falls, South Dakota. You write articles that read like a knowledgeable neighbor, not generic AI content.

RULES YOU MUST FOLLOW (non-negotiable):
1. Voice: warm, specific, locally grounded. Write like someone who actually lives in Sioux Falls, not a template. Avoid clichés, avoid "in today's world," avoid generic filler.
2. Real local specificity required: reference at least one genuinely Sioux Falls-specific fact relevant to the topic — climate (humid continental, ~38in snow/year, freeze-thaw cycles), the 42-inch frost line building code, hard water (12.8-15 grains per gallon, Big Sioux Aquifer), expansive clay soil, named neighborhoods (McKennan Park, All Saints, downtown/Phillips Avenue), or real permit/licensing facts (City of Sioux Falls Building Services, South Dakota state licensing for electricians/plumbers). Do not fabricate statistics you're not given — use the general, well-established facts above, phrased naturally.
3. Structure: an intro paragraph (3-5 sentences), then 3-5 H2 sections. Each H2 section must be genuinely substantial — 2-4 full paragraphs (roughly 100-200 words per section minimum), never a single sentence or two thrown under a heading. If you don't have enough real substance for a section, merge it into another section rather than publish something thin. The whole article should run 700-1200 words — short, choppy articles read as low-effort and don't serve the reader.
4. Never write sales language. The article helps the reader, it doesn't pitch a specific business as "the best" — related businesses get mentioned neutrally via a separate field, not endorsed within the prose.
5. Local SEO discipline: the title and at least one H2 should naturally include the topic paired with "Sioux Falls" or a named neighborhood — not stuffed unnaturally, but present, since that's what local searchers actually type. The SEO title and description must both work as genuine, honest search-result copy for a local search — specific enough that someone searching "[topic] Sioux Falls" would recognize this as exactly what they're looking for.
6. Internal linking discipline: only ever link to a slug that was explicitly given to you in the "real articles already published" list below — never invent, guess, or slightly-modify a slug. An article with zero internal links is completely fine; an article with one broken or hallucinated link is not acceptable.
7. Search result copy that earns the click (this decides whether anyone reads the article):
   - SEO_TITLE: 45 to 60 characters so Google never cuts it off. Lead with the exact phrase a local would type (for example "Drain Cleaning Cost in Sioux Falls"), then the payoff: a year, a number, or a concrete promise ("What to Expect", "Prices and Red Flags", "25 Questions to Ask"). Never a colon, never clickbait, and every promise must be kept by the article.
   - SEO_DESCRIPTION: 140 to 155 characters. Start with the answer or the most useful specific detail (a real number from the article, a named Sioux Falls place or office), then say exactly what the reader gets. Written to a person, not a keyword list.
8. Punctuation: never use em dashes or en dashes anywhere. Use commas, periods, parentheses, or the word \"to\" for ranges.
9. Respond in exactly this delimited format, nothing else, no markdown code fences around the whole response:

TITLE: <string>
SEO_TITLE: <string, 45 to 60 characters>
SEO_DESCRIPTION: <string, 140 to 155 characters>
---BODY---
<the full article body in markdown, NOT including the title as an H1 — start directly with the intro paragraph>
---FAQS---
Q: <question 1>
A: <answer, 1-3 sentences>
Q: <question 2>
A: <answer, 1-3 sentences>
Q: <question 3>
A: <answer, 1-3 sentences>
Q: <question 4>
A: <answer, 1-3 sentences>
Q: <question 5>
A: <answer, 1-3 sentences>

Use exactly 5 FAQs, written the way people actually type questions into Google (the "People also ask" style), each answering something NOT already covered by the category's existing dedicated FAQ article if one is mentioned in context — narrower, more specific questions than a general category FAQ. This format matters: article bodies naturally contain quotes and apostrophes that break JSON parsing, so use these plain delimiters instead, not JSON.`;

export interface GenerateDraftInput {
  categoryName: string;
  categorySlug: string;
  contentType: string;
  direction?: string;
  interviewAnswers?: { question: string; answer: string }[];
  businessName?: string;
  existingArticles?: { title: string; slug: string; category: string; description: string }[];
}

export interface GeneratedDraft {
  title: string;
  seoTitle: string;
  seoDescription: string;
  bodyMarkdown: string;
  embeddedFaqs: { question: string; answer: string }[];
}

export async function runDraftGeneration(input: GenerateDraftInput): Promise<GeneratedDraft> {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured in Netlify environment variables');
  }

  const { categoryName, categorySlug, contentType, direction, interviewAnswers, businessName, existingArticles } = input;

  const userPrompt = `
Generate one article for Sioux Falls Go.

Category: ${categoryName} (${categorySlug})
Content type: ${contentType}
${direction ? `\nSpecific direction from the site owner — follow this closely, it's more important than your own default angle:\n${direction}` : ''}
${businessName ? `\nThis is a ${contentType === 'press-release' ? 'press release' : 'Business Spotlight'} for: ${businessName}` : ''}
${contentType === 'press-release' ? '\nWrite this as a real press release, not a narrative profile: lead with the actual news/announcement in the first sentence, keep it factual and newsworthy rather than storytelling, and keep it noticeably shorter than a full article (roughly half the length).' : ''}
${interviewAnswers?.length ? `\nInterview answers to draw from (write the article using these, in your own words, not verbatim quotes):\n${interviewAnswers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n')}` : ''}

Real articles already published on this site, with their real URLs (use ONLY these exact slugs if you link to any of them — never invent a slug or guess at one that isn't listed here):
${existingArticles?.length ? existingArticles.map((a) => `- "${a.title}" — /guides/${a.slug}${a.description ? ` (${a.description})` : ''}`).join('\n') : '(no existing articles to reference yet)'}

Of the articles listed above, naturally link to 2-3 that are genuinely relevant to this topic, using real markdown links like [anchor text](/guides/exact-slug-from-the-list). Do NOT link to an article whose slug isn't in the list above, and do not force a link in if nothing listed is genuinely relevant — a missing internal link is fine, a broken or invented one is not. If any of the same-category articles listed above already cover this exact angle, pick a genuinely different, complementary angle instead of duplicating it.

Output now in the exact format specified.`.trim();

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 6000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const textBlock = message.content.find((b: any) => b.type === 'text');
  const raw = textBlock && 'text' in textBlock ? textBlock.text : '';

  const titleMatch = raw.match(/^TITLE:\s*(.+?)\s*$/m);
  const seoTitleMatch = raw.match(/^SEO_TITLE:\s*(.+?)\s*$/m);
  const seoDescMatch = raw.match(/^SEO_DESCRIPTION:\s*(.+?)\s*$/m);
  const bodyIdx = raw.indexOf('---BODY---');
  const faqsIdx = raw.indexOf('---FAQS---');

  if (!titleMatch || bodyIdx === -1 || faqsIdx === -1) {
    throw new Error(`Draft response didn't match the expected format. Got: ${raw.slice(0, 300)}`);
  }

  const bodyMarkdown = raw.slice(bodyIdx + '---BODY---'.length, faqsIdx).trim();
  const faqsBlock = raw.slice(faqsIdx + '---FAQS---'.length).trim();
  const embeddedFaqs = Array.from(faqsBlock.matchAll(/Q:\s*(.+?)\s*\nA:\s*(.+?)(?=\n\s*Q:|\s*$)/gs)).map((m) => ({
    question: m[1].trim(),
    answer: m[2].trim(),
  }));

  return {
    title: titleMatch[1].trim(),
    seoTitle: seoTitleMatch?.[1]?.trim() || titleMatch[1].trim(),
    seoDescription: seoDescMatch?.[1]?.trim() || '',
    bodyMarkdown,
    embeddedFaqs,
  };
}
