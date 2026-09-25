/**
 * The agenda as text to paste into a messenger or an e-mail: title, date, then each group as a
 * heading over a bulleted list of its entries.
 *
 * Two forms of the same content: plain text with "- " bullets (reads fine in WhatsApp, Signal,
 * Telegram and plain mail), and HTML with real lists for mail clients that paste rich text.
 * A show with only the unnamed default group gets no heading — just the list.
 */

export interface AgendaGroup {
  /** Empty for the unnamed default group. */
  name: string;
  items: string[];
}

/** A show's date as the operator reads it: "Wed 24 Dec 2026 · 17:00". Unparseable dates come back as they are. */
export function formatShowDate(value: string | null | undefined, locale: string): string {
  const date = value ? new Date(value.replace(' ', 'T')) : undefined;
  if (!date || Number.isNaN(date.getTime())) return value ?? '';
  const day = date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function agendaText(
  header: { title: string; date?: string },
  groups: AgendaGroup[],
  /** Heading for the unnamed group when named groups exist beside it. */
  defaultGroupLabel: string,
): { text: string; html: string } {
  const filled = groups.filter((g) => g.items.length > 0);
  const onlyDefault = filled.length === 1 && !filled[0].name.trim();
  const heading = (g: AgendaGroup) => (onlyDefault ? '' : g.name.trim() || defaultGroupLabel);

  const lines = [header.title, ...(header.date ? [header.date] : [])];
  const html = [`<p><strong>${escapeHtml(header.title)}</strong>${header.date ? `<br>${escapeHtml(header.date)}` : ''}</p>`];
  for (const group of filled) {
    const title = heading(group);
    lines.push('', ...(title ? [title] : []), ...group.items.map((item) => `- ${item}`));
    html.push(
      `${title ? `<p><strong>${escapeHtml(title)}</strong></p>` : ''}<ul>${group.items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`,
    );
  }
  return { text: lines.join('\n'), html: html.join('') };
}
