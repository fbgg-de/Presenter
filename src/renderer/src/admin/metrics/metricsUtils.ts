import type { MetricsSummary } from '@/api/metrics.api';

export type Granularity = 'day' | 'week' | 'month';
export const eventLabel = (event: string) => event.replaceAll('_', ' ');

export function calendarBuckets(from: string, to: string, granularity: Granularity = 'day'): string[] {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || end < start) return [];
  if (granularity === 'week') start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  if (granularity === 'month') start.setUTCDate(1);
  const result: string[] = [];
  while (start <= end && result.length < 3661) {
    result.push(start.toISOString().slice(0, 10));
    if (granularity === 'month') start.setUTCMonth(start.getUTCMonth() + 1);
    else start.setUTCDate(start.getUTCDate() + (granularity === 'week' ? 7 : 1));
  }
  return result;
}

export function eventSeries(data: MetricsSummary, events: string[], from: string, to: string, granularity: Granularity) {
  const byDay = new Map<string, Record<string, number | string>>();
  for (const day of calendarBuckets(from, to, granularity))
    byDay.set(day, { day, ...Object.fromEntries(events.map((event) => [event, 0])) });
  for (const row of data.eventTimeline) {
    if (!events.includes(row.event)) continue;
    if (!byDay.has(row.day)) byDay.set(row.day, { day: row.day, ...Object.fromEntries(events.map((event) => [event, 0])) });
    byDay.get(row.day)![row.event] = row.events;
  }
  return [...byDay.values()].sort((a, b) => String(a.day).localeCompare(String(b.day)));
}

export function percentChange(current: number, previous: number | null): number | null {
  return previous === null || previous === 0 ? null : ((current - previous) / previous) * 100;
}

export function csvText(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const headers = [...new Set(rows.flatMap(Object.keys))];
  const cell = (value: unknown) => {
    let text = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
    if (typeof value === 'string' && /^\s*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return '\uFEFF' + [headers.map(cell).join(','), ...rows.map((row) => headers.map((key) => cell(row[key])).join(','))].join('\r\n');
}

export function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  const csv = csvText(rows);
  if (!csv) return;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
