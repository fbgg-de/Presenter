import { useState, useEffect, ReactNode, type SyntheticEvent } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  GlobalStyles,
  IconButton,
  Paper,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Switch,
  FormControlLabel,
  Alert,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Logout as LogoutIcon,
  Link as LinkIcon,
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as PendingIcon,
  Storage as StorageIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import { useI18nContext } from '@/i18n/i18n-react';
import {
  useGetAdminAccountsQuery,
  useCreateAdminAccountMutation,
  useUpdateAdminAccountMutation,
  useDeleteAdminAccountMutation,
  useGetAdminProvidersQuery,
  useCreateAdminProviderMutation,
  useUpdateAdminProviderMutation,
  useDeleteAdminProviderMutation,
  useAssignProviderToAccountMutation,
  useUnassignProviderFromAccountMutation,
  useGetAdminMigrationsQuery,
  useRunAdminMigrationsMutation,
  useGetAdminConfigQuery,
  type AdminAccount,
  type OidcProvider,
  type CreateAccountRequest,
  type UpdateAccountRequest,
  type CreateProviderRequest,
  type UpdateProviderRequest,
} from '@/api/admin.api';
import { useLogoutMutation, useGetSessionQuery } from '@/api/session.api';
import { AdminLogs } from '@/components/admin/AdminLogs';
import { MetricsDashboard } from '@/components/admin/MetricsDashboard';

const TAB_SLUGS = ['accounts', 'providers', 'metrics', 'logs', 'database', 'config'] as const;
type TabSlug = (typeof TAB_SLUGS)[number];

export const AdminPage = () => {
  const { LL } = useI18nContext();
  const navigate = useNavigate();
  const { tab: tabParam } = useParams<{ tab?: string }>();

  // Derive active tab index from URL param, defaulting to 0
  const activeTab = Math.max(0, TAB_SLUGS.indexOf((tabParam ?? 'accounts') as TabSlug));

  const handleTabChange = (_: SyntheticEvent, newValue: number) => {
    navigate(`/admin/${TAB_SLUGS[newValue]}`, { replace: true });
  };

  // Check if user is admin
  const { data: session } = useGetSessionQuery();
  const isAdmin = session?.authType === 'oidc_admin';

  // Redirect if not admin
  if (session && !isAdmin) {
    navigate('/login', { replace: true });
  }

  // API queries
  const { data: accounts = [], isLoading: accountsLoading, error: accountsError } = useGetAdminAccountsQuery();
  const { data: providers = [], isLoading: providersLoading, error: providersError } = useGetAdminProvidersQuery();

  // Mutations
  const [createAccount] = useCreateAdminAccountMutation();
  const [updateAccount] = useUpdateAdminAccountMutation();
  const [deleteAccount] = useDeleteAdminAccountMutation();
  const [createProvider] = useCreateAdminProviderMutation();
  const [updateProvider] = useUpdateAdminProviderMutation();
  const [deleteProvider] = useDeleteAdminProviderMutation();
  const [assignProvider] = useAssignProviderToAccountMutation();
  const [unassignProvider] = useUnassignProviderFromAccountMutation();
  const [logout] = useLogoutMutation();

  // Migrations
  const { data: migrationStatus, isLoading: migrationsLoading } = useGetAdminMigrationsQuery();
  const [runMigrations, { isLoading: migrationsRunning, data: migrationResult, reset: resetMigrationResult }] =
    useRunAdminMigrationsMutation();

  // Config
  const { data: adminConfig, isLoading: configLoading } = useGetAdminConfigQuery();

  // Dialog state
  const [accountDialog, setAccountDialog] = useState<{ open: boolean; account?: AdminAccount }>({ open: false });
  const [providerDialog, setProviderDialog] = useState<{ open: boolean; provider?: OidcProvider }>({ open: false });
  const [assignDialog, setAssignDialog] = useState<{ open: boolean; license?: number }>({ open: false });
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    type?: 'account' | 'provider';
    id?: number;
    name?: string;
  }>({ open: false });

  const closeDeleteDialog = () => setDeleteDialog({ open: false });

  // Logout handler
  const handleLogout = async () => {
    try {
      await logout().unwrap();
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('Failed to logout:', error);
    }
  };

  // Account dialog handlers
  const handleSaveAccount = async (data: CreateAccountRequest | UpdateAccountRequest) => {
    try {
      if ('license' in data && accountDialog.account) {
        await updateAccount(data).unwrap();
      } else {
        await createAccount(data as CreateAccountRequest).unwrap();
      }
      setAccountDialog({ open: false });
    } catch (error) {
      console.error('Failed to save account:', error);
    }
  };

  // Provider dialog handlers
  const handleSaveProvider = async (data: CreateProviderRequest | UpdateProviderRequest) => {
    try {
      if ('id' in data && providerDialog.provider) {
        await updateProvider(data).unwrap();
      } else {
        await createProvider(data as CreateProviderRequest).unwrap();
      }
      setProviderDialog({ open: false });
    } catch (error) {
      console.error('Failed to save provider:', error);
    }
  };

  // Delete handlers
  const handleDelete = async (type: 'account' | 'provider', id: number) => {
    try {
      if (type === 'account') {
        await deleteAccount({ license: id }).unwrap();
      } else if (type === 'provider') {
        await deleteProvider({ id }).unwrap();
      }
      closeDeleteDialog();
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  // Provider assignment handlers
  const handleAssignProvider = async (providerId: number, isDefault: boolean) => {
    if (!assignDialog.license) return;
    try {
      await assignProvider({
        license: assignDialog.license,
        provider_id: providerId,
        is_default: isDefault,
      }).unwrap();
      setAssignDialog({ open: false });
    } catch (error) {
      console.error('Failed to assign provider:', error);
    }
  };

  const handleUnassignProvider = async (license: number, providerId: number) => {
    try {
      await unassignProvider({ license, provider_id: providerId }).unwrap();
    } catch (error) {
      console.error('Failed to unassign provider:', error);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', p: 3, bgcolor: 'background.default' }}>
      {/* Override the global overflow:hidden set by main.css so this page can scroll */}
      <GlobalStyles styles={{ 'html, body': { overflow: 'auto !important', height: 'auto !important' } }} />
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ overflow: 'visible' }}>
          <Stack
            sx={{
              gap: 3,
            }}
          >
            {/* Header */}
            <Stack
              direction="row"
              sx={{
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Typography variant="h4">{LL.ADMIN.PANEL()}</Typography>
              <Button variant="outlined" color="error" startIcon={<LogoutIcon />} onClick={handleLogout}>
                {LL.AUTH.LOGOUT()}
              </Button>
            </Stack>

            {/* Tabs */}
            <Box
              sx={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                bgcolor: 'background.paper',
                mx: -3,
                px: 3,
                borderBottom: 1,
                borderColor: 'divider',
              }}
            >
              <Tabs value={activeTab} onChange={handleTabChange} variant="scrollable" scrollButtons="auto">
                <Tab label={LL.ADMIN.ACCOUNTS()} />
                <Tab label={LL.ADMIN.OIDC_PROVIDERS()} />
                <Tab label={LL.METRICS.METRICS()} />
                <Tab label={LL.ADMIN_LOGS.NAV_TITLE()} />
                <Tab
                  label={LL.ADMIN.DATABASE()}
                  icon={
                    migrationStatus && migrationStatus.pendingCount > 0 ? (
                      <Chip label={migrationStatus.pendingCount} color="warning" size="small" />
                    ) : undefined
                  }
                  iconPosition="end"
                />
                <Tab label={LL.ADMIN.CONFIG()} />
              </Tabs>
            </Box>

            {/* Accounts Tab */}
            {activeTab === 0 && (
              <Stack
                sx={{
                  gap: 2,
                }}
              >
                <Stack
                  direction="row"
                  sx={{
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Typography variant="h6">
                    {LL.ADMIN.ACCOUNTS()} ({accounts.length})
                  </Typography>
                  <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAccountDialog({ open: true })}>
                    {LL.ADMIN.ADD_ACCOUNT()}
                  </Button>
                </Stack>

                {accountsError && <Alert severity="error">{LL.ADMIN.FAILED_TO_LOAD_ACCOUNTS()}</Alert>}

                {accountsLoading ? (
                  <Typography>{LL.COMMON.LOADING()}</Typography>
                ) : (
                  <TableContainer component={Paper}>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>{LL.AUTH.LICENSE()}</TableCell>
                          <TableCell>{LL.COMMON.NAME()}</TableCell>
                          <TableCell>{LL.COMMON.EMAIL()}</TableCell>
                          <TableCell>{LL.COMMON.STATUS()}</TableCell>
                          <TableCell>{LL.ADMIN.OIDC_PROVIDERS()}</TableCell>
                          <TableCell>{LL.COMMON.ACTIONS()}</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {accounts.map((account) => (
                          <TableRow key={account.license}>
                            <TableCell>{account.license}</TableCell>
                            <TableCell>{account.name || '-'}</TableCell>
                            <TableCell>{account.mail}</TableCell>
                            <TableCell>
                              <Chip
                                label={account.active ? LL.COMMON.ACTIVE() : LL.COMMON.INACTIVE()}
                                color={account.active ? 'success' : 'default'}
                                size="small"
                              />
                            </TableCell>
                            <TableCell>
                              <Stack
                                direction="row"
                                sx={{
                                  gap: 1,
                                  flexWrap: 'wrap',
                                }}
                              >
                                {account.providers.map((p) => (
                                  <Chip
                                    key={p.provider_id}
                                    label={p.provider_name}
                                    size="small"
                                    icon={p.is_default ? <CheckCircleIcon /> : undefined}
                                    onDelete={() => handleUnassignProvider(account.license, p.provider_id)}
                                  />
                                ))}
                                <Tooltip title={LL.ADMIN.ASSIGN_PROVIDER()}>
                                  <IconButton size="small" onClick={() => setAssignDialog({ open: true, license: account.license })}>
                                    <LinkIcon
                                      sx={{
                                        fontSize: 'small',
                                      }}
                                    />
                                  </IconButton>
                                </Tooltip>
                              </Stack>
                            </TableCell>
                            <TableCell>
                              <Stack
                                direction="row"
                                sx={{
                                  gap: 1,
                                }}
                              >
                                <IconButton size="small" onClick={() => setAccountDialog({ open: true, account })}>
                                  <EditIcon fontSize="small" />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() =>
                                    setDeleteDialog({
                                      open: true,
                                      type: 'account',
                                      id: account.license,
                                      name: account.name || account.mail,
                                    })
                                  }
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Stack>
            )}

            {/* Providers Tab */}
            {activeTab === 1 && (
              <Stack
                sx={{
                  gap: 2,
                }}
              >
                <Stack
                  direction="row"
                  sx={{
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Typography variant="h6">
                    {LL.ADMIN.OIDC_PROVIDERS()} ({providers.length})
                  </Typography>
                  <Button variant="contained" startIcon={<AddIcon />} onClick={() => setProviderDialog({ open: true })}>
                    {LL.ADMIN.ADD_PROVIDER()}
                  </Button>
                </Stack>

                {providersError && <Alert severity="error">{LL.ADMIN.FAILED_TO_LOAD_PROVIDERS()}</Alert>}

                {providersLoading ? (
                  <Typography>{LL.COMMON.LOADING()}</Typography>
                ) : (
                  <TableContainer component={Paper}>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>{LL.COMMON.NAME()}</TableCell>
                          <TableCell>{LL.ADMIN.DISCOVERY_URL()}</TableCell>
                          <TableCell>{LL.ADMIN.CLIENT_ID()}</TableCell>
                          <TableCell>{LL.COMMON.STATUS()}</TableCell>
                          <TableCell>{LL.COMMON.ACTIONS()}</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {providers.map((provider) => (
                          <TableRow key={provider.id}>
                            <TableCell>{provider.name}</TableCell>
                            <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {provider.discovery_url}
                            </TableCell>
                            <TableCell sx={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{provider.client_id}</TableCell>
                            <TableCell>
                              <Chip
                                label={provider.enabled ? LL.COMMON.ENABLED() : LL.COMMON.DISABLED()}
                                color={provider.enabled ? 'success' : 'default'}
                                size="small"
                              />
                            </TableCell>
                            <TableCell>
                              <Stack
                                direction="row"
                                sx={{
                                  gap: 1,
                                }}
                              >
                                <IconButton size="small" onClick={() => setProviderDialog({ open: true, provider })}>
                                  <EditIcon fontSize="small" />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() =>
                                    setDeleteDialog({
                                      open: true,
                                      type: 'provider',
                                      id: provider.id,
                                      name: provider.name,
                                    })
                                  }
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Stack>
            )}

            {/* Logs Tab */}
            {activeTab === 3 && (
              <Stack
                sx={{
                  gap: 2,
                }}
              >
                <Typography variant="h6">{LL.ADMIN_LOGS.TITLE()}</Typography>
                <AdminLogs />
              </Stack>
            )}

            {/* Metrics Tab */}
            {activeTab === 2 && (
              <Stack
                sx={{
                  gap: 2,
                }}
              >
                <Typography variant="h6">{LL.METRICS.DASHBOARD()}</Typography>
                <MetricsDashboard />
              </Stack>
            )}

            {/* Database / Migrations Tab */}
            {activeTab === 4 && (
              <Stack sx={{ gap: 2 }}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <StorageIcon />
                    <Typography variant="h6">{LL.ADMIN.MIGRATIONS_TITLE()}</Typography>
                  </Stack>
                  {migrationStatus && (
                    <Chip
                      label={
                        migrationStatus.pendingCount === 0
                          ? LL.ADMIN.MIGRATIONS_UP_TO_DATE()
                          : LL.ADMIN.MIGRATIONS_PENDING({ count: migrationStatus.pendingCount })
                      }
                      color={migrationStatus.pendingCount === 0 ? 'success' : 'warning'}
                      size="small"
                    />
                  )}
                </Stack>

                {migrationStatus && (
                  <Typography variant="body2" color="text.secondary">
                    {LL.ADMIN.MIGRATIONS_CURRENT_VERSION({ version: migrationStatus.currentVersion })}
                    {' · '}
                    {LL.ADMIN.MIGRATIONS_VERSION({ version: migrationStatus.latestVersion })} latest
                  </Typography>
                )}

                {/* Run button */}
                {migrationStatus && migrationStatus.pendingCount > 0 && (
                  <Box>
                    <Button
                      variant="contained"
                      color="warning"
                      disabled={migrationsRunning}
                      onClick={async () => {
                        resetMigrationResult();
                        await runMigrations();
                      }}
                    >
                      {migrationsRunning ? LL.ADMIN.MIGRATIONS_RUNNING() : LL.ADMIN.MIGRATIONS_RUN()}
                    </Button>
                  </Box>
                )}

                {migrationsRunning && <LinearProgress />}

                {/* Last run result */}
                {migrationResult && (
                  <Stack spacing={1}>
                    {migrationResult.errors?.length > 0 ? (
                      migrationResult.errors.map((e) => (
                        <Alert key={e.version} severity="error">
                          {LL.ADMIN.MIGRATIONS_ERROR({ version: e.version, error: e.error })}
                        </Alert>
                      ))
                    ) : (
                      <Alert severity="success">{LL.ADMIN.MIGRATIONS_SUCCESS({ count: migrationResult.applied?.length ?? 0 })}</Alert>
                    )}
                    {migrationResult.applied
                      ?.map((a) => a.output)
                      .filter(Boolean)
                      .map((out, i) => (
                        <Paper key={i} variant="outlined" sx={{ p: 1 }}>
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                            {out}
                          </Typography>
                        </Paper>
                      ))}
                  </Stack>
                )}

                {/* Migration list */}
                {migrationsLoading ? (
                  <LinearProgress />
                ) : migrationStatus ? (
                  <Paper variant="outlined">
                    <List dense disablePadding>
                      {migrationStatus.migrations.map((m, idx) => (
                        <ListItem key={m.version} divider={idx < migrationStatus.migrations.length - 1} sx={{ gap: 1 }}>
                          <ListItemIcon sx={{ minWidth: 32 }}>
                            {m.applied ? (
                              <CheckCircleIcon fontSize="small" color="success" />
                            ) : (
                              <PendingIcon fontSize="small" color="warning" />
                            )}
                          </ListItemIcon>
                          <ListItemText
                            primary={
                              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600, minWidth: 28 }}>
                                  v{m.version}
                                </Typography>
                                <Typography variant="body2">{m.description}</Typography>
                              </Stack>
                            }
                            secondary={
                              m.applied && m.appliedAt
                                ? LL.ADMIN.MIGRATIONS_APPLIED_AT({
                                    date: new Date(m.appliedAt).toLocaleString(),
                                  })
                                : LL.ADMIN.MIGRATIONS_PENDING_BADGE()
                            }
                          />
                          <Chip
                            label={m.applied ? LL.ADMIN.MIGRATIONS_APPLIED_BADGE() : LL.ADMIN.MIGRATIONS_PENDING_BADGE()}
                            color={m.applied ? 'success' : 'warning'}
                            size="small"
                            variant="outlined"
                          />
                        </ListItem>
                      ))}
                    </List>
                  </Paper>
                ) : null}
              </Stack>
            )}
            {/* Config Tab */}
            {activeTab === 5 && (
              <Stack sx={{ gap: 2 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <SettingsIcon />
                  <Typography variant="h6">{LL.ADMIN.CONFIG()}</Typography>
                </Stack>

                <Alert severity="info" icon={false}>
                  {LL.ADMIN.CONFIG_SENSITIVE_OMITTED()}
                </Alert>

                {configLoading && <LinearProgress />}

                {adminConfig && (
                  <Stack spacing={2}>
                    {/* Server */}
                    <ConfigSection title={LL.ADMIN.CONFIG_SECTION_SERVER()}>
                      <ConfigRow label="PHP Version" value={adminConfig.server.phpVersion} />
                      <ConfigRow label="PHP SAPI" value={adminConfig.server.phpSapi} />
                      <ConfigRow label="Web Server" value={adminConfig.server.serverSoftware} />
                      <ConfigRow label="MySQL Version" value={adminConfig.server.mysqlVersion} />
                    </ConfigSection>

                    {/* Application */}
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

                    {/* Database */}
                    <ConfigSection title={LL.ADMIN.CONFIG_SECTION_DATABASE()}>
                      <ConfigRow label="Host" value={adminConfig.database.host} mono />
                      <ConfigRow label="Database" value={adminConfig.database.database} mono />
                      <ConfigRow label="User" value={adminConfig.database.user} mono />
                    </ConfigSection>

                    {/* CORS */}
                    <ConfigSection title={LL.ADMIN.CONFIG_SECTION_CORS()}>
                      {adminConfig.cors.allowedOrigins.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          —
                        </Typography>
                      ) : (
                        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                          {adminConfig.cors.allowedOrigins.map((origin) => (
                            <Chip key={origin} label={origin} size="small" variant="outlined" sx={{ fontFamily: 'monospace' }} />
                          ))}
                        </Stack>
                      )}
                    </ConfigSection>

                    {/* OIDC */}
                    <ConfigSection title={LL.ADMIN.CONFIG_SECTION_OIDC()}>
                      <ConfigRow label="Discovery URL" value={adminConfig.oidc.discoveryUrl} mono />
                      <ConfigRow label="Client ID" value={adminConfig.oidc.clientId} mono />
                      <ConfigRow label="Redirect URI" value={adminConfig.oidc.redirectUri} mono />
                      <ConfigRow label="Admin Group" value={adminConfig.oidc.adminGroup} />
                      <ConfigRow label="Required Group" value={adminConfig.oidc.requiredGroup || '—'} />
                      <ConfigRow label="Scopes" value={adminConfig.oidc.scopes.join(' ')} mono />
                    </ConfigSection>

                    {/* Bible */}
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
            )}
          </Stack>
        </CardContent>
      </Card>
      {/* Dialogs */}
      <AccountDialog
        open={accountDialog.open}
        account={accountDialog.account}
        onClose={() => setAccountDialog({ open: false })}
        onSave={handleSaveAccount}
      />
      <ProviderDialog
        open={providerDialog.open}
        provider={providerDialog.provider}
        onClose={() => setProviderDialog({ open: false })}
        onSave={handleSaveProvider}
      />
      <AssignProviderDialog
        open={assignDialog.open}
        license={assignDialog.license}
        providers={providers}
        assignedProviders={accounts.find((a) => a.license === assignDialog.license)?.providers || []}
        onClose={() => setAssignDialog({ open: false })}
        onAssign={handleAssignProvider}
      />
      <DeleteConfirmDialog
        open={deleteDialog.open}
        type={deleteDialog.type}
        name={deleteDialog.name}
        onClose={closeDeleteDialog}
        onConfirm={() => {
          if (deleteDialog.type && deleteDialog.id) {
            void handleDelete(deleteDialog.type, deleteDialog.id);
          }
        }}
      />
    </Box>
  );
};

// ── Config helper components ──────────────────────────────────────────────────

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
        sx={{
          fontFamily: mono ? 'monospace' : undefined,
          wordBreak: 'break-all',
          color: value == null ? 'text.disabled' : 'text.primary',
        }}
      >
        {value ?? '—'}
      </Typography>
    ) : (
      value
    )}
  </Stack>
);

// ── Account Dialog Component ───────────────────────────────────────────────────
const AccountDialog = ({
  open,
  account,
  onClose,
  onSave,
}: {
  open: boolean;
  account?: AdminAccount;
  onClose: () => void;
  onSave: (data: CreateAccountRequest | UpdateAccountRequest) => void;
}) => {
  const { LL } = useI18nContext();
  const [formData, setFormData] = useState({
    license: account?.license || 0,
    mail: account?.mail || '',
    name: account?.name || '',
    active: account?.active ?? true,
  });

  // Update form data when account changes
  useEffect(() => {
    if (open) {
      setFormData({
        license: account?.license || 0,
        mail: account?.mail || '',
        name: account?.name || '',
        active: account?.active ?? true,
      });
    }
  }, [open, account]);

  const handleSubmit = () => {
    if (account) {
      onSave({ license: formData.license, mail: formData.mail, name: formData.name, active: formData.active });
    } else {
      onSave(formData);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{account ? LL.ADMIN.EDIT_ACCOUNT() : LL.ADMIN.CREATE_ACCOUNT()}</DialogTitle>
      <DialogContent>
        <Stack
          sx={{
            gap: 2,
            mt: 1,
          }}
        >
          <TextField
            label={LL.AUTH.LICENSE_NUMBER()}
            type="number"
            value={formData.license}
            onChange={(e) => setFormData({ ...formData, license: parseInt(e.target.value) || 0 })}
            disabled={!!account}
            fullWidth
          />
          <TextField
            label={LL.COMMON.EMAIL()}
            type="email"
            value={formData.mail}
            onChange={(e) => setFormData({ ...formData, mail: e.target.value })}
            fullWidth
          />
          <TextField
            label={LL.ADMIN.NAME_OPTIONAL()}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            fullWidth
          />
          <FormControlLabel
            control={<Switch checked={formData.active} onChange={(e) => setFormData({ ...formData, active: e.target.checked })} />}
            label={LL.COMMON.ACTIVE()}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{LL.COMMON.CANCEL()}</Button>
        <Button onClick={handleSubmit} variant="contained">
          {LL.COMMON.SAVE()}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// Provider Dialog Component
const ProviderDialog = ({
  open,
  provider,
  onClose,
  onSave,
}: {
  open: boolean;
  provider?: OidcProvider;
  onClose: () => void;
  onSave: (data: CreateProviderRequest | UpdateProviderRequest) => void;
}) => {
  const { LL } = useI18nContext();
  const [formData, setFormData] = useState({
    id: provider?.id || 0,
    name: provider?.name || '',
    discovery_url: provider?.discovery_url || '',
    client_id: provider?.client_id || '',
    client_secret: provider?.client_secret || '',
    scopes: provider?.scopes || 'openid email profile groups',
    required_group: provider?.required_group || '',
    enabled: provider?.enabled ?? true,
  });

  // Update form data when provider changes
  useEffect(() => {
    if (open) {
      setFormData({
        id: provider?.id || 0,
        name: provider?.name || '',
        discovery_url: provider?.discovery_url || '',
        client_id: provider?.client_id || '',
        client_secret: provider?.client_secret || '',
        scopes: provider?.scopes || 'openid email profile groups',
        required_group: provider?.required_group || '',
        enabled: provider?.enabled ?? true,
      });
    }
  }, [open, provider]);

  const handleSubmit = () => {
    if (provider) {
      onSave({ ...formData, id: formData.id });
    } else {
      const { id, ...createData } = formData;
      onSave(createData);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{provider ? LL.ADMIN.EDIT_PROVIDER() : LL.ADMIN.CREATE_PROVIDER()}</DialogTitle>
      <DialogContent>
        <Stack
          sx={{
            gap: 2,
            mt: 1,
          }}
        >
          <TextField
            label={LL.ADMIN.PROVIDER_NAME()}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            fullWidth
          />
          <TextField
            label={LL.ADMIN.DISCOVERY_URL()}
            value={formData.discovery_url}
            onChange={(e) => setFormData({ ...formData, discovery_url: e.target.value })}
            fullWidth
            placeholder="https://idp.example.com/.well-known/openid-configuration"
          />
          <TextField
            label={LL.ADMIN.CLIENT_ID()}
            value={formData.client_id}
            onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
            fullWidth
          />
          <TextField
            label={LL.ADMIN.CLIENT_SECRET()}
            value={formData.client_secret}
            onChange={(e) => setFormData({ ...formData, client_secret: e.target.value })}
            fullWidth
            type="password"
          />
          <TextField
            label={LL.ADMIN.SCOPES()}
            value={formData.scopes}
            onChange={(e) => setFormData({ ...formData, scopes: e.target.value })}
            fullWidth
            helperText={LL.ADMIN.SCOPES_HELP()}
          />
          <TextField
            label={LL.ADMIN.REQUIRED_GROUP_OPTIONAL()}
            value={formData.required_group}
            onChange={(e) => setFormData({ ...formData, required_group: e.target.value })}
            fullWidth
            helperText={LL.ADMIN.REQUIRED_GROUP_HELP()}
          />
          <FormControlLabel
            control={<Switch checked={formData.enabled} onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })} />}
            label={LL.COMMON.ENABLED()}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{LL.COMMON.CANCEL()}</Button>
        <Button onClick={handleSubmit} variant="contained">
          {LL.COMMON.SAVE()}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// Assign Provider Dialog
const AssignProviderDialog = ({
  open,
  license,
  providers,
  assignedProviders,
  onClose,
  onAssign,
}: {
  open: boolean;
  license?: number;
  providers: OidcProvider[];
  assignedProviders: Array<{ provider_id: number; provider_name: string; is_default: boolean }>;
  onClose: () => void;
  onAssign: (providerId: number, isDefault: boolean) => void;
}) => {
  const { LL } = useI18nContext();
  const [selectedProvider, setSelectedProvider] = useState<number | ''>('');
  const [isDefault, setIsDefault] = useState(false);

  const availableProviders = providers.filter((p) => !assignedProviders.some((ap) => ap.provider_id === p.id));

  const handleAssign = () => {
    if (selectedProvider) {
      onAssign(selectedProvider as number, isDefault);
      setSelectedProvider('');
      setIsDefault(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{LL.ADMIN.ASSIGN_PROVIDER_TO_ACCOUNT({ license: license?.toString() || '' })}</DialogTitle>
      <DialogContent>
        <Stack
          sx={{
            gap: 2,
            mt: 1,
          }}
        >
          <FormControl fullWidth>
            <InputLabel>{LL.ADMIN.PROVIDER()}</InputLabel>
            <Select value={selectedProvider} onChange={(e) => setSelectedProvider(e.target.value as number)} label={LL.ADMIN.PROVIDER()}>
              {availableProviders.map((provider) => (
                <MenuItem key={provider.id} value={provider.id}>
                  {provider.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControlLabel
            control={<Switch checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />}
            label={LL.ADMIN.SET_AS_DEFAULT()}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{LL.COMMON.CANCEL()}</Button>
        <Button onClick={handleAssign} variant="contained" disabled={!selectedProvider}>
          {LL.COMMON.ASSIGN()}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// Delete Confirm Dialog
const DeleteConfirmDialog = ({
  open,
  type,
  name,
  onClose,
  onConfirm,
}: {
  open: boolean;
  type?: 'account' | 'provider';
  name?: string;
  onClose: () => void;
  onConfirm: () => void;
}) => {
  const { LL } = useI18nContext();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{LL.ADMIN.CONFIRM_DELETE()}</DialogTitle>
      <DialogContent>
        <Typography>
          {type === 'account'
            ? LL.ADMIN.CONFIRM_DELETE_ACCOUNT({ name: name || '' })
            : LL.ADMIN.CONFIRM_DELETE_PROVIDER({ name: name || '' })}
        </Typography>
        <Alert severity="warning" sx={{ mt: 2 }}>
          {LL.ADMIN.ACTION_CANNOT_BE_UNDONE()}
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{LL.COMMON.CANCEL()}</Button>
        <Button onClick={onConfirm} color="error" variant="contained">
          {LL.COMMON.DELETE()}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
