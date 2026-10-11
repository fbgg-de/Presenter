import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from '@mui/material';
import { useGetMetricsQuery, type MetricEvent, type MetricsQuery } from '@/api/metrics.api';
import { useI18nContext } from '@/i18n/i18n-react';
import { MetricsChartCard } from './MetricsOverview';

export function MetricsRecentEvents({
  query,
  expanded,
  onDevice,
}: {
  query: MetricsQuery;
  expanded: boolean;
  onDevice: (device: string) => void;
}) {
  const { LL, locale } = useI18nContext();
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<MetricEvent | null>(null);
  const {
    currentData: data,
    isFetching,
    isError,
  } = useGetMetricsQuery({ ...query, include_summary: 0, limit: 50, offset: page * 50 }, { skip: !expanded });
  if (!expanded) return null;
  return (
    <>
      {isError ? (
        <Alert severity="error">{LL.METRICS.LOAD_ERROR()}</Alert>
      ) : !data ? (
        <CircularProgress size={24} />
      ) : (
        <>
          <TableContainer sx={{ maxHeight: 520 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>{LL.METRICS.TIMESTAMP()}</TableCell>
                  <TableCell>{LL.METRICS.EVENT()}</TableCell>
                  <TableCell>{LL.METRICS.ENTITY_TYPE_LABEL()}</TableCell>
                  <TableCell>{LL.METRICS.ENTITY_ID()}</TableCell>
                  <TableCell>{LL.METRICS.DEVICE_ID()}</TableCell>
                  <TableCell>{LL.METRICS.DETAILS()}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.metrics.map((row) => {
                  const device = typeof row.metadata?.device_id === 'string' ? row.metadata.device_id : null;
                  return (
                    <TableRow key={row.id} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {new Date(row.created_at.replace(' ', 'T')).toLocaleString(locale)}
                      </TableCell>
                      <TableCell>
                        <Chip label={row.event} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>{row.entity_type ?? '—'}</TableCell>
                      <TableCell>{row.entity_id ?? '—'}</TableCell>
                      <TableCell>
                        {device && device !== 'unknown' ? (
                          <Button size="small" onClick={() => onDevice(device)}>
                            {device.slice(0, 12)}…
                          </Button>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <Button size="small" onClick={() => setSelected(row)}>
                          {LL.METRICS.DETAILS()}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={data.total}
            page={page}
            rowsPerPage={50}
            rowsPerPageOptions={[50]}
            onPageChange={(_, value) => setPage(value)}
          />
        </>
      )}
      {isFetching && data && <CircularProgress size={20} />}
      <Dialog open={!!selected} onClose={() => setSelected(null)} fullWidth maxWidth="md">
        <DialogTitle>{selected?.event}</DialogTitle>
        <DialogContent>
          <Box component="pre" sx={{ overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12 }}>
            {JSON.stringify(selected, null, 2)}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)}>{LL.COMMON.CLOSE()}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export function MetricsWindowConfigurations({ query }: { query: MetricsQuery }) {
  const { LL, locale } = useI18nContext();
  const { currentData: data, isError } = useGetMetricsQuery(
    { ...query, event: 'window_opened', include_summary: 0, limit: 30, offset: 0 },
    { skip: !!query.event && query.event !== 'window_opened' },
  );
  if (query.event && query.event !== 'window_opened') return null;
  return (
    <MetricsChartCard title={LL.METRICS.WINDOW_CONFIGS()} hint={LL.METRICS.RECENT_CONFIGS_HINT()}>
      {isError ? (
        <Alert severity="error">{LL.METRICS.LOAD_ERROR()}</Alert>
      ) : !data ? (
        <CircularProgress size={24} />
      ) : !data.metrics.length ? (
        <Typography color="text.secondary">{LL.METRICS.NO_DATA()}</Typography>
      ) : (
        <TableContainer sx={{ maxHeight: 360 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {[
                  LL.METRICS.TIMESTAMP(),
                  LL.METRICS.COL_NAME(),
                  LL.METRICS.COL_MODE(),
                  LL.METRICS.COL_RESOLUTION(),
                  LL.METRICS.COL_POSITION(),
                  LL.METRICS.COL_FULLSCREEN(),
                  LL.METRICS.COL_FRAMELESS(),
                  LL.METRICS.COL_ALWAYS_ON_TOP(),
                ].map((label) => (
                  <TableCell key={label}>{label}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {data.metrics.map((row) => {
                const m = row.metadata ?? {};
                return (
                  <TableRow key={row.id}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(row.created_at.replace(' ', 'T')).toLocaleString(locale)}</TableCell>
                    <TableCell>{String(m.name ?? '—')}</TableCell>
                    <TableCell>{String(m.displayMode ?? '—')}</TableCell>
                    <TableCell>{m.width && m.height ? `${m.width}×${m.height}` : '—'}</TableCell>
                    <TableCell>{m.left != null && m.top != null ? `${m.left}, ${m.top}` : '—'}</TableCell>
                    {['fullscreen', 'frameless', 'alwaysOnTop'].map((key) => (
                      <TableCell key={key}>{m[key] === true ? '✓' : m[key] === false ? '—' : '?'}</TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </MetricsChartCard>
  );
}
