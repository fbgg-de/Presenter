import { aggregateMetrics } from './aggregate.mjs';

const events = [
  'show_loaded',
  'song_selected',
  'block_navigated',
  'window_opened',
  'presentation_opened',
  'song_created',
  'song_imported',
  'song_updated',
  'song_deleted',
  'show_created',
  'show_saved',
  'show_deleted',
  'setting_changed',
  'pdf_uploaded',
  'media_added',
  'bible_verse_added',
  'musician_button_clicked',
  'musician_layer_action',
  'modal_opened',
  'search_performed',
  'uncaught_error',
  'login',
  'song_renumbered',
  'ws_companion_command',
];
const previousFlow = {
  song_selected: 'show_loaded',
  block_navigated: 'song_selected',
  window_opened: 'block_navigated',
  presentation_opened: 'window_opened',
};
const makeRow = (i, previous = false) => {
  const event = events[i % events.length];
  const date = new Date();
  const session = Math.floor(i / events.length);
  date.setDate(date.getDate() - (session % 30) - (previous ? 30 : 0));
  date.setHours(8 + (session % 12), (i % events.length) * 2, 0, 0);
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const metadata = {
    device_id: `demo-device-${session % 36}`,
    title: `${event.startsWith('show_') ? 'Service' : 'Song'} ${(session % 20) + 1}`,
    source:
      event === 'uncaught_error'
        ? ['react_boundary', 'window_onerror', 'unhandled_rejection'][session % 3]
        : session % 2
          ? 'ccli'
          : 'manual',
    message: ['Media unavailable', 'Connection closed', 'Unable to load resource'][session % 3],
    via: session % 2 ? 'editor' : 'import',
    ok: session % 5 !== 0,
    value: session % 2 ? 'dark' : 'light',
    name: session % 2 ? 'Presentation' : 'Stage',
    displayMode: session % 2 ? 'song' : 'stage',
    width: 1920,
    height: 1080,
    left: 0,
    top: 0,
    fullscreen: session % 2 === 0,
    frameless: true,
    alwaysOnTop: false,
    button: session % 2 ? 'next' : 'sync',
    action: session % 2 ? 'show' : 'hide',
    modal: session % 2 ? 'settings' : 'song_editor',
  };
  // Leave some older events without session data to exercise coverage and historical handling.
  if (i % 7 && !previous)
    Object.assign(metadata, {
      session_id: `demo-session-${session}`,
      session_sequence: (i % events.length) + 1,
      workflow_previous: previousFlow[event],
    });
  return {
    id: previous ? i + 12041 : i + 1,
    account: previous ? [1, 2, 4][session % 3] : (session % 3) + 1,
    event,
    entity_type: event === 'setting_changed' ? 'setting' : event.startsWith('show_') ? 'show' : 'song',
    entity_id: event === 'setting_changed' ? 'themeMode' : String((session % 20) + 1),
    metadata,
    created_at: `${day} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:00`,
  };
};
export const metricRows = [
  ...Array.from({ length: 12040 }, (_, i) => makeRow(i)),
  ...Array.from({ length: 3000 }, (_, i) => makeRow(i, true)),
];
export function metricsFixture({ method, query }) {
  if (method !== 'GET') return { message: 'recorded (mock)' };
  return aggregateMetrics(metricRows, query);
}
