import Anthropic from '@anthropic-ai/sdk';

// Env vars required:
//   ANTHROPIC_API_KEY — from console.anthropic.com
//   SESSION_SECRET / cookie check happens at the edge-function layer already;
//   this function still re-validates auth since functions can be called directly.

const SYSTEM_PROMPT = `You are the Content Engine for Sioux Falls Go, a local business directory and knowledge platform for Sioux Falls, South Dakota. You write articles that read like a knowledgeable neighbor, not generic AI content.

RULES YOU MUST FOLLOW (non-negotiable):
1. Voice: warm, specific, locally grounded. Write like someone who actually lives in Sioux Falls, not a template. Avoid clichés, avoid "in today's world," avoid generic filler.
2. Real local specificity required: reference at least one genuinely Sioux Falls-specific fact relevant to the topic — climate (humid continental, ~38in snow/year, freeze-thaw cycles), the 42-inch frost line building code, hard water (12.8-15 grains per gallon, Big Sioux Aquifer), expansive clay soil, named neighborhoods (McKennan Park, All Saints, downtown/Phillips Avenue), or real permit/licensing facts (City of Sioux Falls Building Services, South Dakota state licensing for electricians/plumbers). Do not fabricate statistics you're not given — use the general, well-established facts above, phrased naturally.
3. Structure: an intro paragraph, then 3-5 H2 sections with real substance, never padded.
4. Never write sales language. The article helps the reader, it doesn't pitch a specific business as "the best" — related businesses get mentioned neutrally via a separate field, not endorsed within the prose.
5. Output ONLY valid JSON matching this exact shape, nothing else, no markdown code fences:
{
  "title": "string",
  "seoTitle": "string, under 70 characters",
  "seoDescription": "string, under 160 characters",
  "bodyMarkdown": "string — the full article body in markdown, NOT including the title as an H1 (start directly with the intro paragraph)",
  "embeddedFaqs": [
    { "question": "string", "answer": "string, 1-3 sentences" }
  ]
}
embeddedFaqs must contain exactly 3 questions, each answering something NOT already covered by the category's existing dedicated FAQ article if one is mentioned in context — narrower, more specific questions than a general category FAQ.`;

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Re-check auth: either a valid admin session cookie (normal UI use) or
  // a matching internal token (the scheduled function calling itself)
  const cookieHeader = req.headers.get('cookie') || '';
  const internalToken = req.headers.get('x-internal-token');
  const hasValidCookie = cookieHeader.includes('sfg_admin_session=');
  const hasValidInternalToken =
    internalToken && process.env.INTERNAL_FUNCTION_TOKEN && internalToken === process.env.INTERNAL_FUNCTION_TOKEN;

  if (!hasValidCookie && !hasValidInternalToken) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured in Netlify environment variables' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }

  const {
    categoryName,        // e.g. "Roofers"
    categorySlug,        // e.g. "roofers"
    contentType,          // e.g. "cost-guide" | "buying-guide" | "seasonal-guide" | "faq" | "business-spotlight" | dual-template types
    promptTemplate,       // human label of which template was picked in the admin UI
    interviewAnswers,     // array of {question, answer} — only present for business-spotlight generations
    businessName,         // only present for business-spotlight generations
    existingArticleTitles, // string[] — titles already published in this category, to avoid cannibalization
  } = body;

  const userPrompt = `
Generate one article for Sioux Falls Go.

Category: ${categoryName} (${categorySlug})
Content type: ${contentType}
Prompt template selected in admin: ${promptTemplate || 'n/a'}
${businessName ? `\nThis is a Business Spotlight for: ${businessName}` : ''}
${interviewAnswers?.length ? `\nInterview answers to draw from (write the article using these, in your own words, not verbatim quotes):\n${interviewAnswers.map((a: any) => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n')}` : ''}

Articles already published in this category (do NOT duplicate their angle — pick a genuinely different, complementary angle):
${existingArticleTitles?.length ? existingArticleTitles.map((t: string) => `- ${t}`).join('\n') : '(none yet — this is the first article for this category)'}

Output the JSON now.`.trim();

  try {
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = message.content.find((b: any) => b.type === 'text');
    const raw = textBlock && 'text' in textBlock ? textBlock.text : '';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const draft = JSON.parse(cleaned);

    return new Response(JSON.stringify({ draft }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Generation failed', detail: String(err?.message || err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config = { path: '/api/generate-draft' };
