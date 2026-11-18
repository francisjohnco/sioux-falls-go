import { getEntry } from 'astro:content';
import { getLiveArticles, newestFirst } from '../lib/articles';

// RSS feed of the newest live guides, like WordPress's /feed. Feed readers,
// aggregators, and some search tools discover new posts through it.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function GET() {
  const site = 'https://siouxfallsgo.com';
  const articles = (await getLiveArticles())
    .sort(newestFirst)
    .slice(0, 40);
  const items = await Promise.all(articles.map(async (a) => {
    const cat = await getEntry(a.data.category);
    return `    <item>
      <title>${esc(a.data.title)}</title>
      <link>${site}/guides/${a.id}/</link>
      <guid isPermaLink="true">${site}/guides/${a.id}/</guid>
      <pubDate>${a.data.publishedAt.toUTCString()}</pubDate>
      <category>${esc(cat?.data.name ?? '')}</category>
      <description>${esc(a.data.seo.description)}</description>
    </item>`;
  }));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Sioux Falls Go Guides</title>
    <link>${site}/guides/</link>
    <atom:link href="${site}/rss.xml" rel="self" type="application/rss+xml" />
    <description>Local guides for living in Sioux Falls, South Dakota.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items.join('\n')}
  </channel>
</rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
