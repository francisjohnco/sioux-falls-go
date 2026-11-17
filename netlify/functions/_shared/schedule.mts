// Pure date helpers for scheduled publishing. No network, no Netlify APIs,
// so they can be tested on their own.

// Articles go live on Tuesdays and Thursdays (0 = Sunday ... 6 = Saturday).
export const PUBLISH_WEEKDAYS = [2, 4];

// Days a slot would otherwise land on but nobody is reading: Thanksgiving,
// Christmas Eve, New Year's Eve.
export const SKIP_DATES = new Set(['2026-11-26', '2026-11-27', '2026-12-24', '2026-12-25', '2026-12-31', '2027-01-01']);

export function chicagoToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function isValidDateString(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T12:00:00Z`).getTime());
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
}

export function isPublishSlot(dateStr: string): boolean {
  return PUBLISH_WEEKDAYS.includes(weekdayOf(dateStr)) && !SKIP_DATES.has(dateStr);
}

export function nextSlotAfter(dateStr: string): string {
  let d = addDays(dateStr, 1);
  for (let i = 0; i < 60; i++) {
    if (isPublishSlot(d)) return d;
    d = addDays(d, 1);
  }
  return d;
}

// The next open slot: one step after the furthest-out article already on the
// calendar, or after today if nothing is scheduled. Appending like this keeps
// the cadence steady no matter how many articles are already queued.
export function planNextSlot(existingDates: string[], today: string): string {
  const future = existingDates.filter((d) => isValidDateString(d) && d >= today).sort();
  const start = future.length ? future[future.length - 1] : today;
  return nextSlotAfter(start);
}

// Each content cluster can publish on its own weekdays, so two series never
// land on the same day (drain cleaning Tue/Thu, custom homes Mon/Wed/Fri).
export function nextSlotOn(dateStr: string, weekdays: number[]): string {
  let d = addDays(dateStr, 1);
  for (let i = 0; i < 60; i++) {
    if (weekdays.includes(weekdayOf(d)) && !SKIP_DATES.has(d)) return d;
    d = addDays(d, 1);
  }
  return d;
}

// The next date for a cluster: its first date when it has nothing yet (this
// may be in the past, which publishes it right away), otherwise the slot after
// its furthest-out article, never earlier than tomorrow.
export function planClusterSlot(clusterDates: string[], today: string, weekdays: number[], firstDate?: string): string {
  const dates = clusterDates.filter(isValidDateString).sort();
  if (!dates.length && firstDate && isValidDateString(firstDate)) return firstDate;
  const last = dates.length ? dates[dates.length - 1] : today;
  return nextSlotOn(last > today ? last : today, weekdays);
}
