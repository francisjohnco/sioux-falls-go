// "Today" for this site means today in Sioux Falls (America/Chicago), not
// today in UTC. Netlify builds run in UTC, so after about 6 PM Central the
// UTC date is already tomorrow. Everything that decides whether something
// is live, upcoming, or expired goes through these helpers so that one
// definition of "today" is used everywhere.

export function chicagoDateString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

// SFG_NOW (YYYY-MM-DD) lets a test build pretend it is another day, so
// scheduled content can be verified without waiting. Never set in production.
export function siteNow(): Date {
  const override = process.env.SFG_NOW;
  if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) return new Date(`${override}T18:00:00Z`);
  return new Date();
}

export function todayCentral(): string {
  return chicagoDateString(siteNow());
}

// Content dates are written in files as plain calendar dates (2026-11-17).
// YAML parses those as UTC midnight, so the UTC slice gives back exactly
// what was typed.
export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
