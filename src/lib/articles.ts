import { getCollection, type CollectionEntry } from 'astro:content';
import { todayCentral, dateKey } from './dates';

export type Article = CollectionEntry<'articles'>;

// An article's publishedAt is its go-live date. A date in the future means
// the article is scheduled: the file already exists in the repo, but no page
// is built for it and it appears nowhere (lists, search, sitemap, related
// links) until that day arrives. The site rebuilds every morning, so it goes
// live on its date without anyone touching anything.
export function publishDay(a: Article): string {
  return dateKey(a.data.publishedAt);
}

export function isLive(a: Article, today: string = todayCentral()): boolean {
  return publishDay(a) <= today;
}

export async function getLiveArticles(): Promise<Article[]> {
  const all = await getCollection('articles');
  const today = todayCentral();
  return all.filter((a) => isLive(a, today));
}

export async function getScheduledArticles(): Promise<Article[]> {
  const all = await getCollection('articles');
  const today = todayCentral();
  return all
    .filter((a) => !isLive(a, today))
    .sort((a, b) => publishDay(a).localeCompare(publishDay(b)));
}
