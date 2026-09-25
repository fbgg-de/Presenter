/**
 * Settings → Connections → ChurchTools: the account's own ChurchTools, used for CCLI SongSelect
 * search, arrangement files for musicians and events. Anyone on the account can set it up. The
 * login token is write-only: blank keeps the stored one, and clearing the address removes both.
 */
import { useEffect, useState } from 'react';
import { Alert, Button, Chip, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetAccountIntegrationsQuery, useUpdateAccountIntegrationsMutation } from '@/api/integrations.api';

/** Plain http (or another scheme) is caught while typing; the server has the final word. */
const looksInvalid = (value: string) => /^[a-z][a-z0-9+.-]*:\/\//i.test(value.trim()) && !/^https:\/\//i.test(value.trim());

export const ChurchToolsSection = () => {
  const { LL } = useI18nContext();
  const C = LL.CHURCH_TOOLS_SETTINGS;
  const { data, isLoading } = useGetAccountIntegrationsQuery();
  const [update, { isLoading: saving }] = useUpdateAccountIntegrationsMutation();
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [result, setResult] = useState<{ severity: 'success' | 'error'; message: string } | null>(null);

  // Loaded and after each save: the stored address; the token is never sent back.
  useEffect(() => {
    setUrl(data?.churchToolsUrl ?? '');
    setToken('');
  }, [data?.churchToolsUrl, data?.churchToolsEnabled]);

  if (isLoading) return <CircularProgress size={20} />;

  const enabled = !!data?.churchToolsEnabled;
  const invalid = looksInvalid(url);
  const changed = url.trim() !== (data?.churchToolsUrl ?? '') || token.trim() !== '';
  // A first-time setup needs both; an existing one may keep its stored token.
  const missingToken = !!url.trim() && !token.trim() && !enabled;
  const clearing = !url.trim() && enabled;

  const save = async () => {
    setResult(null);
    try {
      await update({ churchToolsUrl: url.trim(), ...(token.trim() ? { churchToolsToken: token.trim() } : {}) }).unwrap();
      setResult({ severity: 'success', message: url.trim() ? C.SAVED() : C.REMOVED() });
    } catch (e) {
      setResult({ severity: 'error', message: (e as { data?: { message?: string } })?.data?.message ?? C.SAVE_FAILED() });
    }
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }}>
          {C.HELP()}
        </Typography>
        <Chip size="small" label={enabled ? LL.COMMON.ENABLED() : LL.COMMON.DISABLED()} color={enabled ? 'success' : 'default'} />
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'flex-start' } }}>
        <TextField
          size="small"
          label={C.URL()}
          placeholder="https://example.church.tools/api/"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          error={invalid}
          helperText={invalid ? C.URL_INVALID() : undefined}
          sx={{ flex: 1 }}
        />
        <TextField
          size="small"
          type="password"
          label={C.TOKEN()}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={enabled ? C.TOKEN_PLACEHOLDER_SET() : ''}
          helperText={enabled ? C.TOKEN_HELP() : undefined}
          slotProps={{ inputLabel: { shrink: enabled || !!token || undefined } }}
          sx={{ flex: 1 }}
        />
      </Stack>
      {clearing && <Alert severity="warning">{C.CLEAR_WARNING()}</Alert>}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Button variant="contained" size="small" disabled={!changed || invalid || missingToken || saving} onClick={() => void save()}>
          {LL.COMMON.SAVE()}
        </Button>
        {result && (
          <Typography variant="body2" sx={{ color: result.severity === 'success' ? 'success.main' : 'error.main' }}>
            {result.message}
          </Typography>
        )}
      </Stack>
    </Stack>
  );
};
