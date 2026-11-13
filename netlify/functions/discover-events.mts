import Anthropic from '@anthropic-ai/sdk';
import { getStore } from '@netlify/blobs';
import { addDays, chicagoToday, isValidDateString } from './_shared/schedule.mts';
import { slugify } from './_shared/article-file.mts';

// A weekly SCHEDULED function (Mondays, 1 PM UTC). It asks Claude to search
// the web for confirmed upcoming Sioux Falls events, then drops what it finds
// into a review list in the admin. Nothing it finds reaches the public site
// until a person clicks Add, because a wrong date is worse than a missing
// event. Anything it cannot confirm on a real page is supposed to be left out,
// and every suggestion carries the link it came from so it can be checked.

const CATEGORIES = ['family', 'downtown', 'music', 'sports', 'market'];

export interface Suggestion {
  id: string;
  title: string;
  description: string;
  category: string;
  startDate: string;
  endDate: string | null;
  time: string | null;
  location: string;
  sourceName: string;
  sourceUrl: string;
  foundAt: string;
}

// Pulls the JSON array out of the model's reply and keeps only items that are
// complete, in the future, in a known category, and not already known.
export function parseSuggestions(raw: string, today: string, knownTitles: Set<string>, knownIds: Set<string>): Suggestion[] {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return [];
  let arr: any[];
  try { arr = JSON.parse(raw.slice(start, end + 1)); } catch { return []; }
  if (!Array.isArray(arr)) return [];

  const out: Suggestion[] = [];
  for (const e of arr) {
    if (!e || typeof e.title !== 'string' || !e.title.trim()) continue;
    if (typeof e.description !== 'string' || !e.description.trim()) continue;
    if (!isValidDateString(e.startDate) || e.startDate < today) continue;
    const endDate = isValidDateString(e.endDate) && e.endDate >= e.startDate ? e.endDate : null;
    const category = CATEGORIES.includes(e.category) ? e.category : null;
    if (!category) continue;
    if (typeof e.sourceUrl !== 'string' || !e.sourceUrl.startsWith('https://')) continue;
    if (typeof e.location !== 'string' || !e.location.trim()) continue;
    const id = `${slugify(e.title).slice(0, 50)}-${e.startDate}`;
    if (knownIds.has(id) || knownTitles.has(e.title.trim().toLowerCase())) continue;
    knownIds.add(id);
    out.push({
      id,
      title: e.title.replace(/\s*[\u2013\u2014]\s*/g, ', ').trim(),
      description: e.description.replace(/\s*[\u2013\u2014]\s*/g, ', ').trim(),
      category,
      startDate: e.startDate,
      endDate,
      time: typeof e.time === 'string' && e.time.trim() ? e.time.trim() : null,
      location: e.location.trim(),
      sourceName: typeof e.sourceName === 'string' && e.sourceName.trim() ? e.sourceName.trim() : 'Source',
      sourceUrl: e.sourceUrl,
      foundAt: new Date().toISOString(),
    });
  }
  return out;
}

export default async () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const siteUrl = process.env.URL || process.env.DEPLOY_URL;
  if (!apiKey) { console.error('discover-events: ANTHROPIC_API_KEY not configured'); return new Response('No API key', { status: 500 }); }

  const today = chicagoToday();
  const horizon = addDays(today, 75);

  // What is already on the calendar, so the search does not repeat it.
  let existing: { id: string; title: string }[] = [];
  if (siteUrl) {
    const res = await fetch(`${siteUrl}/events-index.json`).catch(() => null);
    if (res?.ok) existing = await res.json();
  }
  const pendingStore = getStore('pending-events');
  const dismissedStore = getStore('events-dismissed');
  const knownTitles = new Set(existing.map((e) => e.title.trim().toLowerCase()));
  const knownIds = new Set<string>();
  for (const b of (await pendingStore.list()).blobs) knownIds.add(b.key);
  for (const b of (await dismissedStore.list()).blobs) knownIds.add(b.key);

  const prompt = `Today is ${today}. Use web search to find confirmed public events in Sioux Falls, South Dakota that start between ${today} and ${horizon}.

Prefer official sources: the organizer or venue page, Experience Sioux Falls, Downtown Sioux Falls, the Washington Pavilion, the Denny Sanford PREMIER Center, and Falls Park Farmers Market. Only include an event if you read its date on a page for the ${today.slice(0, 4)} or ${Number(today.slice(0, 4)) + 1} edition. If you cannot confirm the date, leave the event out. A short list of events you are sure about is better than a long list you are not.

Categories, pick one each: family, downtown, music, sports, market. Market means farmers markets and art, craft, or vendor shows where people sell goods.

Already on the calendar, do not repeat: ${existing.map((e) => e.title).join('; ') || '(none)'}.

Reply with ONLY a JSON array and nothing else. Each item: {"title": string, "description": one plain sentence with no em dashes or en dashes, "category": string, "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" or null, "time": a short phrase such as "Starts at 7 PM" or null, "location": string, "sourceName": string, "sourceUrl": the exact page you read}. At most 10 items.`;

  const client = new Anthropic({ apiKey });
  let messages: any[] = [{ role: 'user', content: prompt }];
  let finalText = '';
  try {
    for (let i = 0; i < 4; i++) {
      const msg: any = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }] as any,
        messages,
      });
      const text = msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
      if (msg.stop_reason === 'pause_turn') { messages = [...messages, { role: 'assistant', content: msg.content }]; continue; }
      finalText = text;
      break;
    }
  } catch (err: any) {
    console.error('discover-events: search failed:', err?.message || err);
    return new Response('Search failed', { status: 500 });
  }

  const found = parseSuggestions(finalText, today, knownTitles, knownIds);
  for (const s of found) await pendingStore.setJSON(s.id, s);
  console.log(`discover-events: ${found.length} new suggestion(s) added for review`);
  return new Response(`${found.length} suggestions`, { status: 200 });
};

export const config = {
  schedule: '0 13 * * 1', // Mondays, 1 PM UTC
  background: true,
};
