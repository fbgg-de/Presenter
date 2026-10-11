// In-memory fixture backend. Counts are independent of raw-row pagination.
const day = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const knownDevice = (row) =>
  typeof row.metadata?.device_id === 'string' && !['', 'unknown', 'null'].includes(row.metadata.device_id) ? row.metadata.device_id : null;
const dateOf = (row) => new Date(row.created_at.replace(' ', 'T'));
const weekOf = (value) => {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return day(date);
};
const bucket = (row, granularity) =>
  granularity === 'week'
    ? weekOf(row.created_at.slice(0, 10))
    : granularity === 'month'
      ? row.created_at.slice(0, 7) + '-01'
      : row.created_at.slice(0, 10);
const groups = (rows, key) => {
  const map = new Map();
  for (const row of rows) {
    const k = key(row);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(row);
  }
  return [...map];
};
const size = (rows, key) => new Set(rows.map(key).filter((value) => value !== null && value !== undefined && value !== 0)).size;
const count = (rows) => ({
  events: rows.length,
  devices: size(rows, knownDevice),
  accounts: size(rows, (row) => row.account),
  errors: rows.filter((row) => row.event === 'uncaught_error').length,
});
const flowEvents = new Set(['show_loaded', 'song_selected', 'block_navigated', 'window_opened', 'presentation_opened']);
const inRange = (rows, from, to) => rows.filter((row) => (!from || row.created_at >= from) && (!to || row.created_at <= to));

export function aggregateMetrics(allRows, query) {
  const scoped = allRows.filter(
    (row) =>
      (!query.event || row.event === query.event) &&
      (!query.device_id || knownDevice(row) === query.device_id) &&
      (query.account === undefined || row.account === Number(query.account)) &&
      (!query.entity_type || row.entity_type === query.entity_type),
  );
  const snapshot = query.snapshot_id === undefined ? Math.max(0, ...scoped.map((row) => row.id)) : Number(query.snapshot_id);
  const frozen = scoped.filter((row) => row.id <= snapshot);
  const from = query.from?.length === 10 ? query.from + ' 00:00:00' : query.from;
  const to = query.to?.length === 10 ? query.to + ' 23:59:59' : query.to;
  const rows = inRange(frozen, from, to).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
  const granularity = query.granularity || 'day';
  const activity = (granularity) =>
    groups(rows, (row) => bucket(row, granularity))
      .map(([day, list]) => ({ day, ...count(list) }))
      .sort((a, b) => a.day.localeCompare(b.day));
  const timeline = groups(rows, (row) => `${bucket(row, granularity)}:${row.event}`).map(([, list]) => ({
    day: bucket(list[0], granularity),
    event: list[0].event,
    events: list.length,
  }));
  let comparison = null,
    previousRows = [];
  if (from && to) {
    const start = new Date(from.replace(' ', 'T')),
      end = new Date(to.replace(' ', 'T'));
    const duration = end - start + 1000;
    const previousStart = new Date(+start - duration),
      previousEnd = new Date(+start - 1000);
    const stamp = (date) =>
      day(date) +
      ` ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
    comparison = { from: stamp(previousStart), to: stamp(previousEnd) };
    previousRows = inRange(frozen, comparison.from, comparison.to);
    comparison.totals = count(previousRows);
  }
  const accounts = new Set([...rows, ...previousRows].map((row) => row.account).filter(Boolean));
  const accountRows = [...accounts].map((account) => {
    const list = rows.filter((row) => row.account === account),
      prev = previousRows.filter((row) => row.account === account);
    return {
      account,
      ...count(list),
      first_seen: list.at(-1)?.created_at ?? null,
      last_seen: list[0]?.created_at ?? null,
      previous_events: comparison ? prev.length : null,
      previous_errors: comparison ? prev.filter((row) => row.event === 'uncaught_error').length : null,
    };
  });
  const dimensions = [];
  for (const [event, field] of [
    ['song_imported', 'source'],
    ['song_updated', 'via'],
    ['song_renumbered', 'ok'],
    ['window_opened', 'name'],
    ['window_opened', 'displayMode'],
    ['window_opened', 'fullscreen'],
    ['window_opened', 'resolution'],
    ['musician_button_clicked', 'button'],
    ['musician_button_clicked', 'value'],
    ['musician_layer_action', 'action'],
    ['musician_edit_tool_used', 'tool'],
    ['modal_opened', 'modal'],
    ['uncaught_error', 'source'],
  ]) {
    const subset = rows.filter((row) => row.event === event);
    dimensions.push(
      ...groups(subset, (row) =>
        field === 'resolution'
          ? row.metadata?.width && row.metadata?.height
            ? `${row.metadata.width}×${row.metadata.height}`
            : 'unknown'
          : String(row.metadata?.[field] ?? 'unknown'),
      ).map(([name, list]) => ({ event, field, name, events: list.length })),
    );
  }
  const settings = rows.filter((row) => row.event === 'setting_changed' && knownDevice(row));
  const latest = groups(settings, (row) => `${row.account}:${row.entity_id}:${knownDevice(row)}`).map(([, list]) => list[0]);
  const settingValues = groups(latest, (row) => `${row.entity_id}:${JSON.stringify(row.metadata.value)}`).map(([, list]) => ({
    setting: list[0].entity_id,
    name: String(list[0].metadata.value ?? 'unknown'),
    devices: list.length,
  }));
  const today = day(new Date()),
    observationTo = to ? [to.slice(0, 10), today].sort()[0] : today;
  const cohorts = new Map();
  for (const [, list] of groups(rows.filter(knownDevice), knownDevice)) {
    const weeks = [...new Set(list.map((row) => weekOf(row.created_at.slice(0, 10))))].sort();
    if (!cohorts.has(weeks[0])) cohorts.set(weeks[0], []);
    cohorts.get(weeks[0]).push(weeks);
  }
  const retention = [...cohorts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, devices]) => {
      const maxOffset = Math.max(0, Math.floor((new Date(observationTo + 'T12:00:00Z') - new Date(week + 'T12:00:00Z')) / 604800000));
      return {
        week,
        size: devices.length,
        weeks: Array.from({ length: maxOffset + 1 }, (_, offset) => {
          const date = new Date(week + 'T12:00:00Z');
          date.setUTCDate(date.getUTCDate() + offset * 7);
          const key = date.toISOString().slice(0, 10);
          const end = new Date(+date + 6 * 86400000).toISOString().slice(0, 10);
          return {
            offset,
            devices: devices.filter((weeks) => weeks.includes(key)).length,
            complete: end <= observationTo && (!from || key >= from.slice(0, 10)),
          };
        }),
      };
    });
  const errors = rows.filter((row) => row.event === 'uncaught_error');
  const workflowRows = rows.filter((row) => flowEvents.has(row.event));
  const tracked = workflowRows.filter((row) => row.metadata?.session_id && knownDevice(row));
  const sessionKey = (row) => `${row.account}:${knownDevice(row)}:${row.metadata.session_id}`;
  const transitions = groups(
    tracked.filter((row) => flowEvents.has(row.metadata.workflow_previous)),
    (row) => `${row.metadata.workflow_previous}:${row.event}`,
  )
    .map(([, list]) => ({
      source: list[0].metadata.workflow_previous,
      target: list[0].event,
      events: list.length,
      sessions: size(list, sessionKey),
    }))
    .sort((a, b) => b.events - a.events);
  const limit = Math.max(1, Math.min(10000, Number(query.limit || 100))),
    offset = Math.max(0, Number(query.offset || 0));
  return {
    total: rows.length,
    limit,
    offset,
    snapshot_id: snapshot,
    metrics: rows.slice(offset, offset + limit),
    summary:
      Number(query.include_summary) === 1
        ? {
            totals: { ...count(rows), active_days: size(rows, (row) => row.created_at.slice(0, 10)) },
            daily: activity('day'),
            activity: activity(granularity),
            patterns: groups(rows, (row) => `${(dateOf(row).getDay() + 6) % 7}:${dateOf(row).getHours()}`).map(([, list]) => ({
              weekday: (dateOf(list[0]).getDay() + 6) % 7,
              hour: dateOf(list[0]).getHours(),
              events: list.length,
            })),
            features: groups(rows, (row) => row.event)
              .map(([event, list]) => ({ event, ...count(list) }))
              .sort((a, b) => b.events - a.events),
            eventTimeline: timeline,
            entities: groups(rows, (row) => row.entity_type ?? 'unknown').map(([name, list]) => ({ name, events: list.length })),
            accounts: accountRows,
            comparison,
            accountFeatures: groups(
              rows.filter((row) => row.account),
              (row) => `${row.account}:${row.event}`,
            ).map(([, list]) => ({ account: list[0].account, event: list[0].event, ...count(list) })),
            accountDaily: groups(
              rows.filter((row) => row.account),
              (row) => `${row.account}:${row.created_at.slice(0, 10)}`,
            ).map(([, list]) => ({ account: list[0].account, day: list[0].created_at.slice(0, 10), events: list.length })),
            dimensions,
            settingValues,
            topEntities: groups(
              rows.filter((row) => row.entity_id && ['song_selected', 'show_loaded', 'setting_changed'].includes(row.event)),
              (row) => `${row.account}:${row.event}:${row.entity_id}`,
            )
              .map(([, list]) => ({
                account: list[0].account,
                event: list[0].event,
                entity_id: list[0].entity_id,
                title: list[0].metadata?.title ?? null,
                events: list.length,
              }))
              .sort((a, b) => b.events - a.events),
            retention,
            observationTo,
            reliability: {
              affected_devices: size(errors, knownDevice),
              daily: groups(errors, (row) => row.created_at.slice(0, 10)).map(([day, list]) => ({
                day,
                errors: list.length,
                devices: size(list, knownDevice),
              })),
              issues: groups(
                errors,
                (row) => `${row.metadata?.source ?? 'unknown'}:${String(row.metadata?.message ?? 'unknown').slice(0, 240)}`,
              )
                .map(([, list]) => ({
                  source: list[0].metadata?.source ?? 'unknown',
                  message: String(list[0].metadata?.message ?? 'unknown').slice(0, 240),
                  ...count(list),
                  first_seen: list.at(-1).created_at,
                  last_seen: list[0].created_at,
                }))
                .sort((a, b) => b.events - a.events),
            },
            workflow: {
              coverage: { events: workflowRows.length, tracked: tracked.length, sessions: size(tracked, sessionKey) },
              transitions,
            },
          }
        : null,
  };
}
