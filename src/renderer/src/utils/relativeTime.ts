/**
 * Locale-aware relative-time formatting (e.g. "5 minutes ago", "yesterday").
 *
 * Built on the platform `Intl.RelativeTimeFormat` — no extra dependency.
 */

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
  ['second', 1],
];

/**
 * Format a timestamp as a relative time string in the given locale.
 *
 * Accepts ISO strings, epoch millis, `Date`, or MySQL `TIMESTAMP` values
 * (`"YYYY-MM-DD HH:MM:SS"`, which are treated as local time). Small amounts of
 * future drift (clock/timezone skew) are clamped to "now" so a freshly-saved
 * row never reads as "in a few seconds".
 */
export const formatRelativeTime = (dateInput: string | number | Date | null | undefined, locale = 'en'): string => {
  if (dateInput === null || dateInput === undefined || dateInput === '') return '';

  let date: Date;
  if (typeof dateInput === 'string') {
    // MySQL TIMESTAMP ("2026-06-22 07:13:11") → ISO-ish so it parses consistently.
    const normalized = dateInput.includes('T') ? dateInput : dateInput.replace(' ', 'T');
    date = new Date(normalized);
  } else {
    date = new Date(dateInput);
  }

  const ms = date.getTime();
  if (Number.isNaN(ms)) return '';

  let diffSec = Math.round((ms - Date.now()) / 1000); // negative = in the past
  if (diffSec > 0) diffSec = 0; // clamp minor future drift to "now"

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const abs = Math.abs(diffSec);
  for (const [unit, secs] of UNITS) {
    if (abs >= secs || unit === 'second') {
      return rtf.format(Math.round(diffSec / secs), unit);
    }
  }
  return '';
};
