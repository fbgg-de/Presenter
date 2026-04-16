import { useState, useEffect } from 'react';
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
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Logout as LogoutIcon,
  Link as LinkIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
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
  type AdminAccount,
  type OidcProvider,
  type CreateAccountRequest,
  type UpdateAccountRequest,
  type CreateProviderRequest,
  type UpdateProviderRequest,
} from '@/api/admin.api';
import { useLogoutMutation, useGetSessionQuery } from '@/api/session.api';
import { AdminLogs } from '@/components/AdminLogs';
import { MetricsDashboard } from '@/components/MetricsDashboard';

export const AdminPage = () => {
  const { LL } = useI18nContext();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(0);

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
  const handleDelete = async () => {
    try {
      if (deleteDialog.type === 'account' && deleteDialog.id) {
        await deleteAccount({ license: deleteDialog.id }).unwrap();
      } else if (deleteDialog.type === 'provider' && deleteDialog.id) {
        await deleteProvider({ id: deleteDialog.id }).unwrap();
      }
      setDeleteDialog({ open: false });
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
      <Card>
        <CardContent>
          <Stack gap={3}>
            {/* Header */}
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h4">{LL.ADMIN.PANEL()}</Typography>
              <Button variant="outlined" color="error" startIcon={<LogoutIcon />} onClick={handleLogout}>
                {LL.AUTH.LOGOUT()}
              </Button>
            </Stack>

            {/* Tabs */}
            <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
              <Tab label={LL.ADMIN.ACCOUNTS()} />
              <Tab label={LL.ADMIN.OIDC_PROVIDERS()} />
              <Tab label={LL.METRICS.METRICS()} />
              <Tab label={LL.ADMIN_LOGS.NAV_TITLE()} />
            </Tabs>

            {/* Accounts Tab */}
            {activeTab === 0 && (
              <Stack gap={2}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
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
                              <Stack direction="row" gap={1} flexWrap="wrap">
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
                                    <LinkIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Stack>
                            </TableCell>
                            <TableCell>
                              <Stack direction="row" gap={1}>
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
              <Stack gap={2}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
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
                              <Stack direction="row" gap={1}>
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
              <Stack gap={2}>
                <Typography variant="h6">{LL.ADMIN_LOGS.TITLE()}</Typography>
                <AdminLogs />
              </Stack>
            )}

            {/* Metrics Tab */}
            {activeTab === 2 && (
              <Stack gap={2}>
                <Typography variant="h6">{LL.METRICS.DASHBOARD()}</Typography>
                <MetricsDashboard />
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
        onClose={() => setDeleteDialog({ open: false })}
        onConfirm={handleDelete}
      />
    </Box>
  );
};

// Account Dialog Component
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
        <Stack gap={2} sx={{ mt: 1 }}>
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
        <Stack gap={2} sx={{ mt: 1 }}>
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
        <Stack gap={2} sx={{ mt: 1 }}>
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
