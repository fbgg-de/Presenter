import {
  Alert,
  Box,
  Button,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  alpha,
} from '@mui/material';
import type { MetricsSummary } from '@/api/metrics.api';
import { useI18nContext } from '@/i18n/i18n-react';
import { MetricsChartCard } from './MetricsOverview';
import { useMetricsChartStyle } from './MetricsCharts';
import { downloadCsv } from './metricsUtils';

export function MetricsWorkflow({ data, eventFiltered }: { data: MetricsSummary; eventFiltered: boolean }) {
  const { LL, locale } = useI18nContext();
  const { theme, colors } = useMetricsChartStyle();
  const labels: Record<string, string> = {
    show_loaded: LL.METRICS.FLOW_SHOW(),
    song_selected: LL.METRICS.FLOW_SONG(),
    block_navigated: LL.METRICS.FLOW_NAVIGATE(),
    window_opened: LL.METRICS.FLOW_WINDOW(),
    presentation_opened: LL.METRICS.FLOW_PRESENT(),
  };
  const nodes = Object.keys(labels);
  const { coverage, transitions } = data.workflow;
  const max = Math.max(1, ...transitions.map((row) => row.events));
  const start = (index: number) => 65 + index * 80;
  return (
    <MetricsChartCard title={LL.METRICS.PRESENTATION_FLOW()} hint={LL.METRICS.FLOW_HINT()}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 2 }}>
        <Chip label={LL.METRICS.TRACKED_SESSIONS({ count: coverage.sessions })} variant="outlined" />
        <Chip label={LL.METRICS.SESSION_COVERAGE({ tracked: coverage.tracked, total: coverage.events })} variant="outlined" />
        <Button sx={{ ml: 'auto' }} onClick={() => downloadCsv(transitions, 'presentation-flow.csv')} disabled={!transitions.length}>
          {LL.METRICS.EXPORT_CSV()}
        </Button>
      </Stack>
      {eventFiltered ? (
        <Alert severity="info">{LL.METRICS.FLOW_CLEAR_FILTER()}</Alert>
      ) : !transitions.length ? (
        <Alert severity="info">{LL.METRICS.FLOW_NO_DATA()}</Alert>
      ) : (
        <>
          <Box sx={{ overflowX: 'auto' }}>
            <Box
              component="svg"
              role="img"
              aria-label={LL.METRICS.PRESENTATION_FLOW()}
              viewBox="0 0 960 455"
              sx={{ display: 'block', width: '100%', minWidth: 650 }}
            >
              <text x="25" y="20" fill={theme.palette.text.secondary} fontSize="14">
                {LL.METRICS.FLOW_FROM()}
              </text>
              <text x="715" y="20" fill={theme.palette.text.secondary} fontSize="14">
                {LL.METRICS.FLOW_NEXT()}
              </text>
              <defs>
                <marker
                  id="metrics-flow-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="10"
                  markerHeight="10"
                  markerUnits="userSpaceOnUse"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.palette.text.secondary} />
                </marker>
              </defs>
              {transitions.map((row) => {
                const source = nodes.indexOf(row.source),
                  target = nodes.indexOf(row.target);
                if (source < 0 || target < 0) return null;
                return (
                  <path
                    key={`${row.source}:${row.target}`}
                    d={`M 250 ${start(source)} C 420 ${start(source)}, 540 ${start(target)}, 700 ${start(target)}`}
                    stroke={colors[source]}
                    strokeOpacity={0.45}
                    strokeWidth={2 + Math.sqrt(row.events / max) * 13}
                    fill="none"
                    markerEnd="url(#metrics-flow-arrow)"
                    tabIndex={0}
                  >
                    <title>{`${labels[row.source]} → ${labels[row.target]}: ${row.events.toLocaleString(locale)} ${LL.METRICS.EVENTS()}, ${row.sessions} ${LL.METRICS.SESSIONS()}`}</title>
                  </path>
                );
              })}
              {nodes.map((node, index) =>
                [25, 710].map((x, side) => {
                  const events = transitions
                    .filter((row) => (side === 0 ? row.source : row.target) === node)
                    .reduce((sum, row) => sum + row.events, 0);
                  return (
                    <g key={`${node}:${side}`}>
                      <rect
                        x={x}
                        y={start(index) - 26}
                        width="220"
                        height="52"
                        rx="10"
                        fill={theme.palette.background.paper}
                        stroke={alpha(colors[index], 0.8)}
                      />
                      <text x={x + 12} y={start(index) - 2} fill={theme.palette.text.primary} fontSize="14">
                        {labels[node]}
                      </text>
                      <text x={x + 12} y={start(index) + 17} fill={theme.palette.text.secondary} fontSize="12">
                        {events.toLocaleString(locale)} {LL.METRICS.EVENTS()}
                      </text>
                    </g>
                  );
                }),
              )}
            </Box>
          </Box>
          <Typography variant="caption" color="text.secondary">
            {LL.METRICS.FLOW_WIDTH_HINT()}
          </Typography>
          <TableContainer sx={{ maxHeight: 300, mt: 2 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>{LL.METRICS.FLOW_FROM()}</TableCell>
                  <TableCell>{LL.METRICS.FLOW_NEXT()}</TableCell>
                  <TableCell align="right">{LL.METRICS.EVENTS()}</TableCell>
                  <TableCell align="right">{LL.METRICS.SESSIONS()}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {transitions.map((row) => (
                  <TableRow key={`${row.source}:${row.target}`}>
                    <TableCell>{labels[row.source] || row.source}</TableCell>
                    <TableCell>{labels[row.target] || row.target}</TableCell>
                    <TableCell align="right">{row.events.toLocaleString(locale)}</TableCell>
                    <TableCell align="right">{row.sessions.toLocaleString(locale)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </MetricsChartCard>
  );
}
