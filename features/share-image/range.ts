import type { Card } from '@/features/home/grid';
import {
  addDays,
  COLUMNS,
  HALF_COLUMNS,
  shiftMonth,
  WEEK_START,
  weekOf,
} from '@/features/month-board/layout';
import type { IsoDate } from '@/lib/time';

/** What a shared image covers (H63): this week or this month. Custom waits for phase 2. */
export type ShareSpan = 'week' | 'month';

export type ShareRange = {
  span: ShareSpan;
  first: IsoDate;
  last: IsoDate;
  /** With its year: *Nov 10 to Nov 16, 2026*, *November 2026*. */
  title: string;
  /** A week's two rows (H63): Sun–Wed over Thu–Sat. */
  rows?: [IsoDate, IsoDate];
};

/** What the board shows when Share is tapped: the week and the month in view. */
export type ShareView = { week: IsoDate; month: string };

/**
 * The week or the month the board is showing, not today's: a shared image
 * is of the page being looked at. The week starts where the board's does.
 */
export function shareRange(span: ShareSpan, view: ShareView): ShareRange {
  if (span === 'week') {
    const first = weekOf(view.week, WEEK_START);
    const last = addDays(first, COLUMNS - 1);
    return {
      span,
      first,
      last,
      title: weekShareTitle(first, last),
      rows: [first, addDays(first, HALF_COLUMNS)],
    };
  }
  const month = view.month;
  return {
    span,
    first: `${month}-01`,
    last: addDays(`${shiftMonth(month, 1)}-01`, -1),
    title: monthShareTitle(month),
  };
}

const utc = (day: IsoDate): Date => new Date(`${day}T00:00:00Z`);

/** `Nov 10 to Nov 16, 2026`; across a year, `Dec 28, 2025 to Jan 3, 2026`. */
export function weekShareTitle(first: IsoDate, last: IsoDate): string {
  const short = (day: IsoDate): string =>
    utc(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const year = (day: IsoDate): string => day.slice(0, 4);
  return year(first) === year(last)
    ? `${short(first)} to ${short(last)}, ${year(last)}`
    : `${short(first)}, ${year(first)} to ${short(last)}, ${year(last)}`;
}

/** `November 2026`. */
export function monthShareTitle(month: string): string {
  return utc(`${month}-01`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * The records a range holds: one on a day inside it, or a range that
 * touches it. A month's grid shows the days around it too; a shared image
 * does not carry what is outside the range it names.
 */
export function inRange(cards: Card[], range: Pick<ShareRange, 'first' | 'last'>): Card[] {
  return cards.filter((card) => {
    const start = card.splash.range?.start ?? card.day;
    const end = card.splash.range?.end ?? card.day;
    return start <= range.last && end >= range.first;
  });
}
