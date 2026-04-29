import { type ReactNode } from 'react';
import { Alert, Box, Chip, Divider, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import { Settings as SettingsIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetAdminConfigQuery } from '@/api/admin.api';

export const Config = () => {
  const { LL } = useI18nContext();
  const { data: adminConfig, isLoading } = useGetAdminConfigQuery();

  return (
    <Stack sx={{ gap: 2 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <SettingsIcon />
        <Typography variant="h6">{LL.ADMIN.CONFIG()}</Typography>
      </Stack>

      <Alert severity="info" icon={false}>
        {LL.ADMIN.CONFIG_SENSITIVE_OMITTED()}
      </Alert>

      {isLoading && <LinearProgress />}

      {adminConfig && (
        <Stack spacing={2}>
          <ConfigSection title={LL.ADMIN.CONFIG_SECTION_SERVER()}>
            <ConfigRow label="PHP Version" value={adminConfig.server.phpVersion} />
            <ConfigRow label="PHP SAPI" value={adminConfig.server.phpSapi} />
            <ConfigRow label="Web Server" value={adminConfig.server.serverSoftware} />
            <ConfigRow label="MySQL Version" value={adminConfig.server.mysqlVersion} />
          </ConfigSection>

          <ConfigSection title={LL.ADMIN.CONFIG_SECTION_APP()}>
            <ConfigRow label="Domain" value={adminConfig.app.domain} />
            <ConfigRow label="Base URL" value={adminConfig.app.baseUrl} mono />
            <ConfigRow
              label={LL.ADMIN.CONFIG_DEV_MODE()}
              value={
                <Chip
                  label={adminConfig.app.development ? LL.ADMIN.CONFIG_ENABLED() : LL.ADMIN.CONFIG_DISABLED()}
                  color={adminConfig.app.development ? 'warning' : 'success'}
                  size="small"
                />
              }
            />
            <ConfigRow label="Default Language" value={adminConfig.app.defaultLanguage} />
            <ConfigRow label="Search Result Limit" value={adminConfig.app.searchResultLimit} />
            <ConfigRow label="Custom Number Limit" value={adminConfig.app.customNumberLimit} />
          </ConfigSection>

          <ConfigSection title={LL.ADMIN.CONFIG_SECTION_DATABASE()}>
            <ConfigRow label="Host" value={adminConfig.database.host} mono />
            <ConfigRow label="Database" value={adminConfig.database.database} mono />
            <ConfigRow label="User" value={adminConfig.database.user} mono />
          </ConfigSection>

          <ConfigSection title={LL.ADMIN.CONFIG_SECTION_CORS()}>
            {adminConfig.cors.allowedOrigins.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1 }}>
                —
              </Typography>
            ) : (
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5, px: 2, py: 1 }}>
                {adminConfig.cors.allowedOrigins.map((origin) => (
                  <Chip key={origin} label={origin} size="small" variant="outlined" sx={{ fontFamily: 'monospace' }} />
                ))}
              </Stack>
            )}
          </ConfigSection>

          <ConfigSection title={LL.ADMIN.CONFIG_SECTION_OIDC()}>
            <ConfigRow label="Discovery URL" value={adminConfig.oidc.discoveryUrl} mono />
            <ConfigRow label="Client ID" value={adminConfig.oidc.clientId} mono />
            <ConfigRow label="Redirect URI" value={adminConfig.oidc.redirectUri} mono />
            <ConfigRow label="Admin Group" value={adminConfig.oidc.adminGroup} />
            <ConfigRow label="Required Group" value={adminConfig.oidc.requiredGroup || '—'} />
            <ConfigRow label="Scopes" value={adminConfig.oidc.scopes.join(' ')} mono />
          </ConfigSection>

          <ConfigSection title={LL.ADMIN.CONFIG_SECTION_BIBLE()}>
            <ConfigRow
              label={LL.ADMIN.CONFIG_ENABLED()}
              value={
                <Chip
                  label={adminConfig.bible.enabled ? LL.ADMIN.CONFIG_ENABLED() : LL.ADMIN.CONFIG_DISABLED()}
                  color={adminConfig.bible.enabled ? 'success' : 'default'}
                  size="small"
                />
              }
            />
            {adminConfig.bible.enabled && (
              <>
                <ConfigRow label="Name" value={adminConfig.bible.name} />
                <ConfigRow label="Base URL" value={adminConfig.bible.baseUrl} mono />
              </>
            )}
          </ConfigSection>
        </Stack>
      )}
    </Stack>
  );
};

const ConfigSection = ({ title, children }: { title: string; children: ReactNode }) => (
  <Paper variant="outlined">
    <Box sx={{ px: 2, py: 1, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
    </Box>
    <Stack divider={<Divider />}>{children}</Stack>
  </Paper>
);

const ConfigRow = ({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) => (
  <Stack direction="row" sx={{ px: 2, py: 0.75, alignItems: 'center', gap: 2, minHeight: 36 }}>
    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 160, flexShrink: 0 }}>
      {label}
    </Typography>
    {typeof value === 'string' || typeof value === 'number' || value === null || value === undefined ? (
      <Typography
        variant="body2"
        sx={{ fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-all', color: value == null ? 'text.disabled' : 'text.primary' }}
      >
        {value ?? '—'}
      </Typography>
    ) : (
      value
    )}
  </Stack>
);
