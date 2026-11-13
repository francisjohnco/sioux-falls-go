import { getCollection } from 'astro:content';
import { todayCentral, dateKey } from './dates';

export type EventCategory = 'family' | 'downtown' | 'music' | 'sports' | 'market';

export interface UpcomingEvent {
  id: string;
  category: EventCategory;
  title: string;
  description: string; // the event description plus a plain-language "when" sentence
  date: Date; // next date that has not passed, at noon UTC so it formats the same everywhere
  endDate?: Date;
  location: string;
  photo: string;
  sourceName: string;
  sourceUrl: string;
  remaining: number; // how many dates are left, counting this one
}

const atNoon = (key: string) => new Date(`${key}T12:00:00Z`);
const monthDay = (key: string) => atNoon(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function rangeLabel(start: string, end: string): string {
  if (start === end) return monthDay(start);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return sameMonth ? `${monthDay(start)} to ${atNoon(end).getUTCDate()}` : `${monthDay(start)} to ${monthDay(end)}`;
}

// Every event that still has a date on or after today, soonest first. An
// event with several dates shows its next one. Once the last date passes the
// event disappears at the next rebuild, so nothing on the site can go stale
// the way a hand-typed list did.
export async function getUpcomingEvents(): Promise<UpcomingEvent[]> {
  const today = todayCentral();
  const all = await getCollection('events');
  const out: UpcomingEvent[] = [];

  for (const e of all) {
    const occ = e.data.occurrences
      .map((o) => ({ start: dateKey(o.date), end: o.endDate ? dateKey(o.endDate) : dateKey(o.date), time: o.time }))
      .sort((a, b) => a.start.localeCompare(b.start));
    const idx = occ.findIndex((o) => o.end >= today);
    if (idx === -1) continue;

    const next = occ[idx];
    const remaining = occ.length - idx;
    const last = occ[occ.length - 1];

    const when: string[] = [];
    if (next.end !== next.start) when.push(`Runs ${rangeLabel(next.start, next.end)}.`);
    if (next.time) when.push(`${next.time}.`);
    if (remaining > 1) when.push(`More dates through ${monthDay(last.end)}.`);
    if (e.data.note) when.push(e.data.note);

    out.push({
      id: e.id,
      category: e.data.category,
      title: e.data.title,
      description: [e.data.description, ...when].join(' '),
      date: atNoon(next.start),
      endDate: next.end !== next.start ? atNoon(next.end) : undefined,
      location: e.data.location,
      photo: e.data.photo,
      sourceName: e.data.sourceName,
      sourceUrl: e.data.sourceUrl,
      remaining,
    });
  }

  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}
