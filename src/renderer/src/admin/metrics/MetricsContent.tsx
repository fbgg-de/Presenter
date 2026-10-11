import { useState } from 'react';
import { Box, MenuItem, Select, Stack, Typography } from '@mui/material';
import type { MetricsQuery, MetricsSummary } from '@/api/metrics.api';
import { useI18nContext } from '@/i18n/i18n-react';
import { MetricBarChart, MetricTimeline } from './MetricsCharts';
import { eventLabel, type Granularity } from './metricsUtils';
import { MetricsWorkflow } from './MetricsWorkflow';
import { MetricsChartCard } from './MetricsOverview';
import { MetricsWindowConfigurations } from './MetricsRecentEvents';

export function MetricsContent({
  data,
  from,
  to,
  granularity,
  accountNames,
  eventFiltered,
  query,
}: {
  data: MetricsSummary;
  from: string;
  to: string;
  granularity: Granularity;
  accountNames: Record<number, string>;
  eventFiltered: boolean;
  query: MetricsQuery;
}) {
  const { LL } = useI18nContext();
  const [setting, setSetting] = useState('');
  const features = (match: (event: string) => boolean) =>
    data.features.filter((row) => match(row.event)).map((row) => ({ name: eventLabel(row.event), events: row.events }));
  const dimension = (event: string, field: string) => data.dimensions.filter((row) => row.event === event && row.field === field);
  const keys = [...new Set(data.topEntities.filter((row) => row.event === 'setting_changed').map((row) => row.entity_id))].sort();
  const chosenSetting = keys.includes(setting) ? setting : keys[0];
  const top = (event: string) =>
    data.topEntities
      .filter((row) => row.event === event)
      .slice(0, 10)
      .map((row) => ({
        name: `${row.title || `#${row.entity_id}`} · ${accountNames[row.account] || `#${row.account}`}`,
        events: row.events,
      }));
  const settingFrequency = new Map<string, number>();
  for (const row of data.topEntities.filter((row) => row.event === 'setting_changed'))
    settingFrequency.set(row.entity_id, (settingFrequency.get(row.entity_id) ?? 0) + row.events);
  const grid = { display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 3 };
  return (
    <Stack spacing={3}>
      <MetricsWorkflow data={data} eventFiltered={eventFiltered} />
      <MetricTimeline
        data={data}
        events={['song_created', 'song_imported', 'song_updated', 'song_deleted']}
        title={LL.METRICS.SONG_LIFECYCLE()}
        from={from}
        to={to}
        granularity={granularity}
        stacked
      />
      <Box sx={grid}>
        <MetricBarChart
          title={LL.METRICS.SONG_ACTIVITY()}
          rows={features((event) => event.startsWith('song_') || event.startsWith('ccli_'))}
        />
        <MetricBarChart title={LL.METRICS.SHOW_ACTIVITY()} rows={features((event) => event.startsWith('show_'))} />
        <MetricBarChart title={LL.METRICS.TOP_SONGS()} hint={LL.METRICS.TOP_TEN_HINT()} rows={top('song_selected')} />
        <MetricBarChart title={LL.METRICS.TOP_SHOWS()} hint={LL.METRICS.TOP_TEN_HINT()} rows={top('show_loaded')} />
        <MetricBarChart title={LL.METRICS.SONG_IMPORT_SOURCES()} rows={dimension('song_imported', 'source')} />
        <MetricBarChart title={LL.METRICS.SONG_CHANGES_BY()} rows={dimension('song_updated', 'via')} />
        <MetricBarChart title={LL.METRICS.SONG_RENUMBERS()} rows={dimension('song_renumbered', 'ok')} />
        <MetricBarChart title={LL.METRICS.CONTENT_ACTIVITY()} rows={features((event) => /^(pdf_|media_|bible_|set_list_)/.test(event))} />
      </Box>
      <MetricTimeline
        data={data}
        events={['show_created', 'show_loaded', 'show_saved', 'show_deleted']}
        title={LL.METRICS.SHOW_ACTIVITY()}
        from={from}
        to={to}
        granularity={granularity}
      />
      <Box sx={grid}>
        <MetricBarChart
          title={LL.METRICS.PRESENTATION_ACTIVITY()}
          rows={features((event) => ['presentation_opened', 'style_changed', 'block_navigated'].includes(event))}
        />
        <MetricBarChart title={LL.METRICS.WINDOWS_OPENED()} rows={dimension('window_opened', 'name')} />
        <MetricBarChart title={LL.METRICS.WINDOW_MODES()} rows={dimension('window_opened', 'displayMode')} />
        <MetricBarChart title={LL.METRICS.WINDOW_RESOLUTIONS()} rows={dimension('window_opened', 'resolution')} />
        <MetricBarChart title={LL.METRICS.WINDOW_FULLSCREEN()} rows={dimension('window_opened', 'fullscreen')} />
        <MetricBarChart title={LL.METRICS.MUSICIAN_BUTTON_USAGE()} rows={dimension('musician_button_clicked', 'button')} />
        <MetricBarChart title={LL.METRICS.LAYER_ACTIONS()} rows={dimension('musician_layer_action', 'action')} />
        <MetricBarChart
          title={LL.METRICS.SYNC_MODE_USAGE()}
          rows={dimension('musician_button_clicked', 'value').filter((row) => row.name !== 'unknown')}
        />
        <MetricBarChart title={LL.METRICS.MODAL_OPENED()} rows={dimension('modal_opened', 'modal')} />
        <MetricBarChart title={LL.METRICS.ENTITY_DISTRIBUTION()} rows={data.entities} />
      </Box>
      <MetricTimeline
        data={data}
        events={['search_performed']}
        title={LL.METRICS.SEARCHES_OVER_TIME()}
        from={from}
        to={to}
        granularity={granularity}
      />
      <MetricsWindowConfigurations query={query} />
      <Box sx={grid}>
        <MetricBarChart
          title={LL.METRICS.SETTING_CHANGE_FREQUENCY()}
          rows={[...settingFrequency].map(([name, events]) => ({ name, events }))}
        />
        <MetricsChartCard title={LL.METRICS.SETTING_VALUES()} hint={LL.METRICS.SETTING_VALUES_HINT()}>
          {keys.length > 0 ? (
            <>
              <Select
                size="small"
                value={chosenSetting}
                onChange={(e) => setSetting(e.target.value)}
                inputProps={{ 'aria-label': LL.METRICS.SETTING_LABEL() }}
              >
                {keys.map((key) => (
                  <MenuItem key={key} value={key}>
                    {key}
                  </MenuItem>
                ))}
              </Select>
              <MetricBarChart
                title={chosenSetting}
                valueLabel={LL.METRICS.DEVICES()}
                rows={data.settingValues
                  .filter((row) => row.setting === chosenSetting)
                  .map((row) => ({ name: row.name, events: row.devices }))}
              />
            </>
          ) : (
            <Typography color="text.secondary">{LL.METRICS.NO_DATA()}</Typography>
          )}
        </MetricsChartCard>
      </Box>
      <MetricBarChart
        title={LL.METRICS.SYSTEM_EVENTS()}
        rows={features((event) =>
          ['login', 'fresh_start', 'metrics_disabled', 'ws_companion_connected', 'ws_companion_command'].includes(event),
        )}
      />
    </Stack>
  );
}
