import { useState, useEffect } from 'react';
import {
  Alert,
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Link as LinkIcon,
  CheckCircle as CheckCircleIcon,
  Church as ChurchIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import {
  useGetAdminAccountsQuery,
  useCreateAdminAccountMutation,
  useUpdateAdminAccountMutation,
  useDeleteAdminAccountMutation,
  useGetAdminProvidersQuery,
  useAssignProviderToAccountMutation,
  useUnassignProviderFromAccountMutation,
  type AdminAccount,
  type CreateAccountRequest,
  type UpdateAccountRequest,
} from '@/api/admin.api';
import { FormControl, InputLabel, Select, MenuItem } from '@mui/material';

export const Accounts = () => {
  const { LL } = useI18nContext();
  const { data: accounts = [], isLoading, error } = useGetAdminAccountsQuery();
  const { data: providers = [] } = useGetAdminProvidersQuery();
  const [createAccount] = useCreateAdminAccountMutation();
  const [updateAccount] = useUpdateAdminAccountMutation();
  const [deleteAccount] = useDeleteAdminAccountMutation();
  const [assignProvider] = useAssignProviderToAccountMutation();
  const [unassignProvider] = useUnassignProviderFromAccountMutation();

  const [accountDialog, setAccountDialog] = useState<{ open: boolean; account?: AdminAccount }>({ open: false });
  const [assignDialog, setAssignDialog] = useState<{ open: boolean; license?: number }>({ open: false });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; id?: number; name?: string }>({ open: false });
  const [ctDialog, setCtDialog] = useState<{ open: boolean; account?: AdminAccount }>({ open: false });

  const handleSaveAccount = async (data: CreateAccountRequest | UpdateAccountRequest) => {
    try {
      if ('license' in data && accountDialog.account) {
        await updateAccount(data).unwrap();
      } else {
        await createAccount(data as CreateAccountRequest).unwrap();
      }
      setAccountDialog({ open: false });
    } catch (e) {
      console.error('Failed to save account:', e);
    }
  };

  const handleSaveCtConfig = async (license: number, churchToolsUrl: string, churchToolsToken: string) => {
    try {
      await updateAccount({
        license,
        churchToolsUrl: churchToolsUrl || null,
        churchToolsToken: churchToolsToken || null,
      }).unwrap();
      setCtDialog({ open: false });
    } catch (e) {
      console.error('Failed to save ChurchTools config:', e);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog.id) return;
    try {
      await deleteAccount({ license: deleteDialog.id }).unwrap();
      setDeleteDialog({ open: false });
    } catch (e) {
      console.error('Failed to delete account:', e);
    }
  };

  const handleAssignProvider = async (providerId: number, isDefault: boolean) => {
    if (!assignDialog.license) return;
    try {
      await assignProvider({ license: assignDialog.license, provider_id: providerId, is_default: isDefault }).unwrap();
      setAssignDialog({ open: false });
    } catch (e) {
      console.error('Failed to assign provider:', e);
    }
  };

  const handleUnassignProvider = async (license: number, providerId: number) => {
    try {
      await unassignProvider({ license, provider_id: providerId }).unwrap();
    } catch (e) {
      console.error('Failed to unassign provider:', e);
    }
  };

  return (
    <Stack sx={{ gap: 2 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">
          {LL.ADMIN.ACCOUNTS()} ({accounts.length})
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAccountDialog({ open: true })}>
          {LL.ADMIN.ADD_ACCOUNT()}
        </Button>
      </Stack>

      {error && <Alert severity="error">{LL.ADMIN.FAILED_TO_LOAD_ACCOUNTS()}</Alert>}

      {isLoading ? (
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
                <TableCell>{LL.ADMIN.CHURCH_TOOLS()}</TableCell>
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
                    <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
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
                          <LinkIcon sx={{ fontSize: 'small' }} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                      <Chip
                        label={account.church_tools_enabled ? LL.COMMON.ENABLED() : LL.COMMON.DISABLED()}
                        color={account.church_tools_enabled ? 'success' : 'default'}
                        size="small"
                      />
                      <Tooltip title={LL.ADMIN.CONFIGURE_CHURCH_TOOLS()}>
                        <IconButton size="small" onClick={() => setCtDialog({ open: true, account })}>
                          <ChurchIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1}>
                      <IconButton size="small" onClick={() => setAccountDialog({ open: true, account })}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => setDeleteDialog({ open: true, id: account.license, name: account.name || account.mail })}
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

      <AccountDialog
        open={accountDialog.open}
        account={accountDialog.account}
        onClose={() => setAccountDialog({ open: false })}
        onSave={handleSaveAccount}
      />
      <AssignProviderDialog
        open={assignDialog.open}
        license={assignDialog.license}
        providers={providers}
        assignedProviders={accounts.find((a) => a.license === assignDialog.license)?.providers || []}
        onClose={() => setAssignDialog({ open: false })}
        onAssign={handleAssignProvider}
      />
      <ChurchToolsDialog
        open={ctDialog.open}
        account={ctDialog.account}
        onClose={() => setCtDialog({ open: false })}
        onSave={handleSaveCtConfig}
      />
      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false })} maxWidth="sm" fullWidth>
        <DialogTitle>{LL.ADMIN.CONFIRM_DELETE()}</DialogTitle>
        <DialogContent>
          <Typography>{LL.ADMIN.CONFIRM_DELETE_ACCOUNT({ name: deleteDialog.name || '' })}</Typography>
          <Alert severity="warning" sx={{ mt: 2 }}>
            {LL.ADMIN.ACTION_CANNOT_BE_UNDONE()}
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false })}>{LL.COMMON.CANCEL()}</Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            {LL.COMMON.DELETE()}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

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
  const [formData, setFormData] = useState({ license: 0, mail: '', name: '', active: true });

  useEffect(() => {
    if (open)
      setFormData({
        license: account?.license || 0,
        mail: account?.mail || '',
        name: account?.name || '',
        active: account?.active ?? true,
      });
  }, [open, account]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{account ? LL.ADMIN.EDIT_ACCOUNT() : LL.ADMIN.CREATE_ACCOUNT()}</DialogTitle>
      <DialogContent>
        <Stack sx={{ gap: 2, mt: 1 }}>
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
        <Button
          onClick={() =>
            onSave(account ? { license: formData.license, mail: formData.mail, name: formData.name, active: formData.active } : formData)
          }
          variant="contained"
        >
          {LL.COMMON.SAVE()}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

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
  providers: Array<{ id: number; name: string }>;
  assignedProviders: Array<{ provider_id: number; provider_name: string; is_default: boolean }>;
  onClose: () => void;
  onAssign: (providerId: number, isDefault: boolean) => void;
}) => {
  const { LL } = useI18nContext();
  const [selectedProvider, setSelectedProvider] = useState<number | ''>('');
  const [isDefault, setIsDefault] = useState(false);
  const available = providers.filter((p) => !assignedProviders.some((ap) => ap.provider_id === p.id));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{LL.ADMIN.ASSIGN_PROVIDER_TO_ACCOUNT({ license: license?.toString() || '' })}</DialogTitle>
      <DialogContent>
        <Stack sx={{ gap: 2, mt: 1 }}>
          <FormControl fullWidth>
            <InputLabel>{LL.ADMIN.PROVIDER()}</InputLabel>
            <Select value={selectedProvider} onChange={(e) => setSelectedProvider(e.target.value as number)} label={LL.ADMIN.PROVIDER()}>
              {available.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
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
        <Button
          onClick={() => {
            if (selectedProvider) {
              onAssign(selectedProvider as number, isDefault);
              setSelectedProvider('');
              setIsDefault(false);
            }
          }}
          variant="contained"
          disabled={!selectedProvider}
        >
          {LL.COMMON.ASSIGN()}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

/**
 * Dialog for configuring the ChurchTools integration URL and API token per account.
 * The token is write-only: it is never returned by the API, so the field is always blank
 * on open. Leave it blank to keep the existing token unchanged.
 */
const ChurchToolsDialog = ({
  open,
  account,
  onClose,
  onSave,
}: {
  open: boolean;
  account?: AdminAccount;
  onClose: () => void;
  onSave: (license: number, url: string, token: string) => void;
}) => {
  const { LL } = useI18nContext();
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');

  useEffect(() => {
    if (open) {
      setUrl(account?.church_tools_url ?? '');
      setToken(''); // token is write-only; never pre-filled
    }
  }, [open, account]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{LL.ADMIN.CONFIGURE_CHURCH_TOOLS()}</DialogTitle>
      <DialogContent>
        <Stack sx={{ gap: 2, mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {LL.ADMIN.CHURCH_TOOLS_HELP()}
          </Typography>
          <TextField
            label={LL.ADMIN.CHURCH_TOOLS_URL()}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://demo.church.tools/api/"
            fullWidth
          />
          <TextField
            label={LL.ADMIN.CHURCH_TOOLS_TOKEN()}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={account?.church_tools_enabled ? LL.ADMIN.CHURCH_TOOLS_TOKEN_PLACEHOLDER_SET() : ''}
            helperText={LL.ADMIN.CHURCH_TOOLS_TOKEN_HELP()}
            type="password"
            fullWidth
          />
          {!url && account?.church_tools_enabled && <Alert severity="warning">{LL.ADMIN.CHURCH_TOOLS_CLEAR_WARNING()}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{LL.COMMON.CANCEL()}</Button>
        <Button onClick={() => account && onSave(account.license, url, token)} variant="contained">
          {LL.COMMON.SAVE()}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
