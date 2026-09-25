/**
 * Settings → Spotify: the account's own Spotify app, used to link set list songs to recordings.
 * Anyone on the account can set it up. The secret is write-only: blank keeps the stored one, and
 * clearing the client id removes both.
 */
import { useEffect, useState } from 'react';
import { Alert, Button, Chip, CircularProgress, Link, Stack, TextField, Typography } from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetAccountIntegrationsQuery, useUpdateAccountIntegrationsMutation } from '@/api/integrations.api';

export const SpotifySection = () => {
  const { LL } = useI18nContext();
  const S = LL.SPOTIFY_SETTINGS;
  const { data, isLoading } = useGetAccountIntegrationsQuery();
  const [update, { isLoading: saving }] = useUpdateAccountIntegrationsMutation();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [result, setResult] = useState<{ severity: 'success' | 'error'; message: string } | null>(null);

  // Loaded and after each save: the stored id; the secret is never sent back.
  useEffect(() => {
    setClientId(data?.spotifyClientId ?? '');
    setClientSecret('');
  }, [data?.spotifyClientId, data?.spotifyEnabled]);

  if (isLoading) return <CircularProgress size={20} />;

  const enabled = !!data?.spotifyEnabled;
  const changed = clientId.trim() !== (data?.spotifyClientId ?? '') || clientSecret.trim() !== '';
  // A first-time setup needs both halves; an existing one may keep its stored secret.
  const missingSecret = !!clientId.trim() && !clientSecret.trim() && !enabled;
  const clearing = !clientId.trim() && enabled;

  const save = async () => {
    setResult(null);
    try {
      await update({
        spotifyClientId: clientId.trim(),
        ...(clientSecret.trim() ? { spotifyClientSecret: clientSecret.trim() } : {}),
      }).unwrap();
      setResult({ severity: 'success', message: clientId.trim() ? S.SAVED() : S.REMOVED() });
    } catch (e) {
      setResult({ severity: 'error', message: (e as { data?: { message?: string } })?.data?.message ?? S.SAVE_FAILED() });
    }
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }}>
          {S.HELP()}{' '}
          <Link href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer">
            developer.spotify.com/dashboard
          </Link>
        </Typography>
        <Chip size="small" label={enabled ? LL.COMMON.ENABLED() : LL.COMMON.DISABLED()} color={enabled ? 'success' : 'default'} />
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField size="small" label={S.CLIENT_ID()} value={clientId} onChange={(e) => setClientId(e.target.value)} sx={{ flex: 1 }} />
        <TextField
          size="small"
          type="password"
          label={S.CLIENT_SECRET()}
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder={enabled ? S.SECRET_PLACEHOLDER_SET() : ''}
          helperText={enabled ? S.SECRET_HELP() : undefined}
          slotProps={{ inputLabel: { shrink: enabled || !!clientSecret || undefined } }}
          sx={{ flex: 1 }}
        />
      </Stack>
      {clearing && <Alert severity="warning">{S.CLEAR_WARNING()}</Alert>}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Button variant="contained" size="small" disabled={!changed || missingSecret || saving} onClick={() => void save()}>
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
