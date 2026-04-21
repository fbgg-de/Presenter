import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Typography,
} from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import { Delete as DeleteIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import { useGetLogsQuery, useClearLogsMutation, type LogEntry } from '@/api/logs.api';

const CHUNK_SIZE = 50;

const getSeverityColor = (severity: string): 'error' | 'warning' | 'info' | 'default' => {
  switch (severity) {
    case 'ERROR':
      return 'error';
    case 'WARNING':
      return 'warning';
    case 'INFO':
      return 'info';
    default:
      return 'default';
  }
};

export const AdminLogs = () => {
  const { LL } = useI18nContext();
  const [severity, setSeverity] = useState<string>('');
  const [offset, setOffset] = useState(0);
  const [allLogs, setAllLogs] = useState<LogEntry[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const { data, isLoading, isFetching, refetch } = useGetLogsQuery({
    offset,
    limit: CHUNK_SIZE,
    ...(severity ? { severity } : {}),
  });

  const [clearLogs, { isLoading: isClearing }] = useClearLogsMutation();

  // Append new logs when data changes
  useEffect(() => {
    if (data?.logs) {
      setAllLogs((prev) => {
        // Avoid duplicates by checking if we're loading initial data
        if (offset === 0) {
          return data.logs;
        }
        // Append new logs
        const existingIds = new Set(prev.map((log) => `${log.timestamp}-${log.message}`));
        const newLogs = data.logs.filter((log) => !existingIds.has(`${log.timestamp}-${log.message}`));
        return [...prev, ...newLogs];
      });
    }
  }, [data, offset]);

  // Reset logs when severity filter changes
  useEffect(() => {
    setOffset(0);
    setAllLogs([]);
  }, [severity]);

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    if (!tableRef.current || loadingRef.current || isFetching) return;

    const { scrollTop, scrollHeight, clientHeight } = tableRef.current;
    const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

    // Load more when scrolled to 80%
    if (scrollPercentage > 0.8 && data && allLogs.length < data.total) {
      loadingRef.current = true;
      setOffset((prev) => prev + CHUNK_SIZE);
    }
  }, [isFetching, data, allLogs.length]);

  useEffect(() => {
    if (!isFetching) {
      loadingRef.current = false;
    }
  }, [isFetching]);

  useEffect(() => {
    const tableElement = tableRef.current;
    if (tableElement) {
      tableElement.addEventListener('scroll', handleScroll);
      return () => tableElement.removeEventListener('scroll', handleScroll);
    }
    return undefined;
  }, [handleScroll]);

  const handleClearLogs = async () => {
    try {
      await clearLogs().unwrap();
      setOffset(0);
      setAllLogs([]);
      refetch();
      setConfirmClear(false);
    } catch (error) {
      console.error('Failed to clear logs:', error);
    }
  };

  const handleRefresh = () => {
    setOffset(0);
    setAllLogs([]);
    refetch();
  };

  return (
    <Box>
      <Stack direction="row" spacing={2} mb={2} alignItems="center">
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>{LL.ADMIN_LOGS.SEVERITY_LABEL()}</InputLabel>
          <Select value={severity} label={LL.ADMIN_LOGS.SEVERITY_LABEL()} onChange={(e) => setSeverity(e.target.value)}>
            <MenuItem value="">{LL.ADMIN_LOGS.SEVERITY_ALL()}</MenuItem>
            <MenuItem value="ERROR">{LL.ADMIN_LOGS.SEVERITY_ERROR()}</MenuItem>
            <MenuItem value="WARNING">{LL.ADMIN_LOGS.SEVERITY_WARNING()}</MenuItem>
            <MenuItem value="INFO">{LL.ADMIN_LOGS.SEVERITY_INFO()}</MenuItem>
          </Select>
        </FormControl>

        <Button startIcon={<RefreshIcon />} onClick={handleRefresh} disabled={isLoading || isFetching}>
          {LL.ADMIN_LOGS.REFRESH()}
        </Button>

        <Button
          startIcon={<DeleteIcon />}
          color="error"
          onClick={() => setConfirmClear(true)}
          disabled={isClearing || allLogs.length === 0}
        >
          {LL.ADMIN_LOGS.CLEAR_LOGS()}
        </Button>

        <Box flexGrow={1} />

        {data && (
          <Typography variant="body2" color="text.secondary">
            {LL.ADMIN_LOGS.SHOWING({ shown: allLogs.length, total: data.total })}
          </Typography>
        )}
      </Stack>

      {isLoading && offset === 0 ? (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      ) : allLogs.length === 0 ? (
        <Alert severity="info">{LL.ADMIN_LOGS.NO_LOGS()}</Alert>
      ) : (
        <TableContainer
          component={Paper}
          ref={tableRef}
          sx={{
            maxHeight: 'calc(100vh - 250px)',
            overflow: 'auto',
          }}
        >
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell width="180">{LL.ADMIN_LOGS.TIMESTAMP()}</TableCell>
                <TableCell width="100">{LL.ADMIN_LOGS.SEVERITY_LABEL()}</TableCell>
                <TableCell width="200">{LL.ADMIN_LOGS.LOCATION()}</TableCell>
                <TableCell width="200">{LL.ADMIN_LOGS.FUNCTION()}</TableCell>
                <TableCell>{LL.ADMIN_LOGS.MESSAGE()}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {allLogs.map((log, index) => (
                <TableRow key={`${log.timestamp}-${index}`} hover>
                  <TableCell>{log.timestamp}</TableCell>
                  <TableCell>
                    <Chip label={log.severity} color={getSeverityColor(log.severity)} size="small" />
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.875rem', fontFamily: 'monospace' }}>{log.location}</TableCell>
                  <TableCell sx={{ fontSize: '0.875rem', fontFamily: 'monospace' }}>{log.function}</TableCell>
                  <TableCell sx={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{log.message}</TableCell>
                </TableRow>
              ))}
              {isFetching && offset > 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 2 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Clear confirmation dialog */}
      <Dialog open={confirmClear} onClose={() => setConfirmClear(false)}>
        <DialogTitle>{LL.ADMIN_LOGS.CLEAR_TITLE()}</DialogTitle>
        <DialogContent>
          <DialogContentText>{LL.ADMIN_LOGS.CLEAR_MESSAGE()}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClear(false)}>{LL.COMMON.CANCEL()}</Button>
          <Button onClick={handleClearLogs} color="error" variant="contained" disabled={isClearing}>
            {LL.ADMIN_LOGS.CLEAR_LOGS()}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
