// Black Friday weekend dates for any year: Thanksgiving is the fourth
// Thursday of November, Black Friday the day after, Small Business Saturday
// the day after that, and Cyber Monday the Monday after Thanksgiving.

export interface BlackFridayDates {
  year: number;
  thanksgiving: Date;
  blackFriday: Date;
  smallBusinessSaturday: Date;
  cyberMonday: Date;
}

const ymd = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, 12)); // noon UTC avoids timezone date flips

export function blackFridayDates(year: number): BlackFridayDates {
  const nov1 = ymd(year, 10, 1).getUTCDay(); // 0 Sunday
  const firstThursday = 1 + ((4 - nov1 + 7) % 7);
  const tg = firstThursday + 21;
  return {
    year,
    thanksgiving: ymd(year, 10, tg),
    blackFriday: ymd(year, 10, tg + 1),
    smallBusinessSaturday: ymd(year, 10, tg + 2),
    cyberMonday: ymd(year, 10, tg + 4),
  };
}

// The season the page talks about: this year's, until Cyber Monday is over,
// then next year's.
export function currentBlackFriday(today: string): BlackFridayDates {
  const y = Number(today.slice(0, 4));
  const thisYear = blackFridayDates(y);
  return today > thisYear.cyberMonday.toISOString().slice(0, 10) ? blackFridayDates(y + 1) : thisYear;
}

export const longDate = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
export const shortDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
