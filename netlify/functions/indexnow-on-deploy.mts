import { getStore } from '@netlify/blobs';

// Runs automatically after every successful production deploy, including the
// daily 5 AM refresh. It tells search engines that support IndexNow (Bing,
// Yandex, Seznam, Naver, and the services that use Bing's index) exactly which
// pages are new or changed, so they crawl them within hours instead of days.
// This is the same job WordPress SEO plugins do with their "ping" feature.
//
// Google does not use IndexNow and retired its sitemap ping in 2023. Google
// finds changes through the sitemap (which now carries real lastmod dates)
// and Search Console.
//
// To avoid spamming, it remembers what it already sent (Netlify Blobs) and
// only resubmits a URL when its sitemap lastmod changes. Category and other
// hub pages are only sent the first time they appear, plus the few pages that
// genuinely change daily.

const KEY = '45c2b02b06ee673f761f5b3d274bec61'; // public by design; the matching file is /45c2b02b06ee673f761f5b3d274bec61.txt
const ALWAYS = ['/', '/events/', '/guides/', '/local-deals/', '/mailer-deals/'];

export function pickUrls(entries: { loc: string; lastmod: string }[], sent: Record<string, string>, site: string): string[] {
  const out: string[] = [];
  for (const { loc, lastmod } of entries) {
    const path = loc.replace(site, '') || '/';
    const prev = sent[loc];
    const isArticle = path.startsWith('/guides/') && path !== '/guides/';
    if (!prev) out.push(loc); // never sent
    else if (isArticle && prev !== lastmod) out.push(loc); // article edited
    else if (ALWAYS.includes(path) && prev !== lastmod) out.push(loc); // daily hubs
  }
  return out;
}

async function run(context?: string) {
  if (context && context !== 'production') return;
  const site = (process.env.URL || 'https://siouxfallsgo.com').replace(/\/$/, '');
  const host = new URL(site).host;

  const res = await fetch(`${site}/sitemap-0.xml`);
  if (!res.ok) { console.error('indexnow: could not read sitemap', res.status); return; }
  const xml = await res.text();
  const entries = [...xml.matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?/g)]
    .map((m) => ({ loc: m[1], lastmod: (m[2] || '').slice(0, 10) }));

  const store = getStore('indexnow');
  const sent: Record<string, string> = ((await store.get('sent', { type: 'json' })) as any) || {};
  const urlList = pickUrls(entries, sent, site);
  if (urlList.length === 0) { console.log('indexnow: nothing new to submit'); return; }

  const submit = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key: KEY, keyLocation: `${site}/${KEY}.txt`, urlList: urlList.slice(0, 10000) }),
  });
  // 200 and 202 both mean accepted.
  if (submit.status !== 200 && submit.status !== 202) {
    console.error('indexnow: submission refused', submit.status, await submit.text());
    return;
  }
  for (const { loc, lastmod } of entries) if (urlList.includes(loc)) sent[loc] = lastmod;
  await store.setJSON('sent', sent);
  console.log(`indexnow: submitted ${urlList.length} URL(s)`);
}

export default {
  async deploySucceeded(event: any) {
    try {
      await run(event?.deploy?.context);
    } catch (err: any) {
      console.error('indexnow: failed', err?.message || err);
    }
  },
};
