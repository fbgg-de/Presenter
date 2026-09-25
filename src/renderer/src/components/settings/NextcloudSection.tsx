/**
 * Settings → Nextcloud. The account's Nextcloud address, which anyone on the account can set, and in
 * the web version this browser's sign-in: like the desktop client (Login Flow v2, so a shared
 * identity provider signs you in with one click), then the media folder and the public link screens
 * play from. The login is kept in this browser; signing out revokes the app password.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Divider, Link, Stack, TextField, Typography } from '@mui/material';
import { CloudOutlined as CloudIcon, FolderOpenOutlined as FolderIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetSessionQuery } from '@/api/session.api';
import { setNextcloud, updateNextcloud, useNextcloud } from '@/nextcloud/connection';
import { nextcloudFolderSource } from '@/nextcloud/folderSource';
import { checkConnection, revokeConnection, shareFolder, signIn } from '@/nextcloud/relay';
import { CopyToMediaFolderDialog } from '@/components/agenda/CopyToMediaFolderDialog';
import { useGetAccountIntegrationsQuery, useUpdateAccountIntegrationsMutation } from '@/api/integrations.api';
import { isElectronApp } from '@/utils';

/** Plain http (or another scheme) is caught while typing; the server has the final word. */
const looksInvalid = (value: string) => /^[a-z][a-z0-9+.-]*:\/\//i.test(value.trim()) && !/^https:\/\//i.test(value.trim());

const NextcloudAddress = () => {
  const { LL } = useI18nContext();
  const N = LL.NEXTCLOUD;
  const { data, isLoading } = useGetAccountIntegrationsQuery();
  const [update, { isLoading: saving }] = useUpdateAccountIntegrationsMutation();
  const [address, setAddress] = useState('');
  const [result, setResult] = useState<{ severity: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    setAddress(data?.nextcloudUrl ?? '');
  }, [data?.nextcloudUrl]);

  if (isLoading) return <CircularProgress size={20} />;

  const invalid = looksInvalid(address);
  const changed = address.trim() !== (data?.nextcloudUrl ?? '');

  const save = async () => {
    setResult(null);
    try {
      await update({ nextcloudUrl: address.trim() }).unwrap();
      setResult({ severity: 'success', message: address.trim() ? N.ADDRESS_SAVED() : N.ADDRESS_REMOVED() });
    } catch (e) {
      setResult({ severity: 'error', message: (e as { data?: { message?: string } })?.data?.message ?? N.ADDRESS_INVALID() });
    }
  };

  return (
    <Stack spacing={1}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'flex-start' } }}>
        <TextField
          size="small"
          label={N.ADDRESS()}
          placeholder="https://cloud.example.com"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          error={invalid}
          helperText={invalid ? N.ADDRESS_INVALID() : N.ADDRESS_HELP()}
          sx={{ flex: 1 }}
        />
        <Button
          variant="contained"
          size="small"
          sx={{ mt: { sm: 0.5 } }}
          disabled={!changed || invalid || saving}
          onClick={() => void save()}
        >
          {LL.COMMON.SAVE()}
        </Button>
      </Stack>
      {changed && data?.nextcloudUrl && <Alert severity="warning">{N.ADDRESS_CHANGE_WARNING()}</Alert>}
      {result && <Alert severity={result.severity}>{result.message}</Alert>}
    </Stack>
  );
};

export const NextcloudSection = () => {
  const { LL } = useI18nContext();
  const desktop = isElectronApp();
  return (
    <Stack spacing={2}>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {LL.NEXTCLOUD.INTRO()}
      </Typography>
      <NextcloudAddress />
      <Divider />
      {desktop ? (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {LL.NEXTCLOUD.DESKTOP_NOTE()}
        </Typography>
      ) : (
        <NextcloudSignIn />
      )}
    </Stack>
  );
};

const NextcloudSignIn = () => {
  const { LL } = useI18nContext();
  const N = LL.NEXTCLOUD;
  const { data: session } = useGetSessionQuery();
  const connection = useNextcloud();
  const [busy, setBusy] = useState<'signing-in' | 'sharing' | 'checking' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const folders = useMemo(() => nextcloudFolderSource(false), []);

  const accountServer = session?.settings?.nextcloudUrl ?? null;
  if (!accountServer) {
    return <Alert severity="info">{N.DISABLED()}</Alert>;
  }

  const fail = (err: unknown) => setError(err instanceof Error ? err.message : String(err));

  const connect = async () => {
    setError(null);
    setStatus(null);
    setBusy('signing-in');
    abort.current = new AbortController();
    try {
      const signedIn = await signIn({ signal: abort.current.signal });
      if (!signedIn) return;
      const account = await checkConnection({ ...signedIn, root: '' });
      setNextcloud({ ...signedIn, account: session?.account, displayName: account.displayName, root: '' });
      setStatus(N.SIGNED_IN({ name: account.displayName }));
      setPicking(true);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  const chooseFolder = async (root: string) => {
    if (!connection) return;
    setPicking(false);
    setError(null);
    setBusy('sharing');
    try {
      const share = await shareFolder(root, connection);
      updateNextcloud({ root, share });
      setStatus(N.FOLDER_READY());
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  const check = async () => {
    if (!connection) return;
    setError(null);
    setBusy('checking');
    try {
      const account = await checkConnection(connection);
      updateNextcloud({ displayName: account.displayName });
      setStatus(N.CONNECTION_OK({ name: account.displayName }));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    if (!connection) return;
    // Revoking can fail (already revoked, Nextcloud offline); this browser forgets it either way.
    await revokeConnection(connection).catch(() => undefined);
    setNextcloud(null);
    setStatus(N.SIGNED_OUT());
  };

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2">{N.THIS_BROWSER()}</Typography>

      {!connection ? (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
          <Typography variant="body2" sx={{ flex: 1 }}>
            {N.SERVER({ server: accountServer })}
          </Typography>
          {busy === 'signing-in' ? (
            <Button color="inherit" startIcon={<CircularProgress size={16} />} onClick={() => abort.current?.abort()}>
              {N.CANCEL_SIGN_IN()}
            </Button>
          ) : (
            <Button variant="contained" startIcon={<CloudIcon />} onClick={() => void connect()}>
              {N.CONNECT()}
            </Button>
          )}
        </Stack>
      ) : (
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip
              icon={<CloudIcon />}
              label={N.ACCOUNT({ name: connection.displayName ?? connection.loginName, server: connection.server })}
            />
            <Button size="small" color="inherit" disabled={!!busy} onClick={() => void check()}>
              {N.CHECK()}
            </Button>
            <Button size="small" color="error" disabled={!!busy} onClick={() => void disconnect()}>
              {N.DISCONNECT()}
            </Button>
          </Stack>
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="body2">{N.MEDIA_FOLDER()}</Typography>
            <Box component="code" sx={{ px: 0.75, py: 0.25, borderRadius: 0.5, bgcolor: 'action.hover', fontSize: '0.85rem' }}>
              /{connection.root}
            </Box>
            <Button size="small" startIcon={<FolderIcon />} disabled={!!busy} onClick={() => setPicking(true)}>
              {N.CHOOSE_FOLDER()}
            </Button>
          </Stack>
          {connection.share ? (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {N.SHARE_ACTIVE()}{' '}
              <Link href={connection.share.url} target="_blank" rel="noreferrer">
                {connection.share.url}
              </Link>
            </Typography>
          ) : (
            <Alert severity="warning">{N.NO_FOLDER()}</Alert>
          )}
        </Stack>
      )}

      {busy === 'signing-in' && <Alert severity="info">{N.WAITING()}</Alert>}
      {busy === 'sharing' && <Alert severity="info">{N.SHARING()}</Alert>}
      {status && !error && <Alert severity="success">{status}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {N.DESKTOP_NOTE()}
      </Typography>

      {connection && (
        <CopyToMediaFolderDialog
          open={picking}
          files={[]}
          mediaPath=""
          source={folders}
          title={N.CHOOSE_FOLDER_TITLE()}
          hint={N.CHOOSE_FOLDER_HINT()}
          confirmLabel={N.USE_FOLDER()}
          rootLabel={N.ALL_FILES()}
          initialFolder={connection.root}
          busy={busy === 'sharing'}
          onCancel={() => setPicking(false)}
          onConfirm={(folder) => void chooseFolder(folder)}
        />
      )}
    </Stack>
  );
};
