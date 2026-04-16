import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Security as SecurityIcon } from '@mui/icons-material';
import { useLocation } from 'react-router-dom';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetAccountsQuery, useGetAdminOidcAuthUrlQuery, useGetOidcAuthUrlQuery } from '@/api/session.api';

const useQueryParam = (name: string): string | null => {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search).get(name), [search, name]);
};

const LAST_SELECTED_ACCOUNT_KEY = 'presenter_last_account';

type SelectedAccount = number | 'admin' | '';

export const LoginPage = () => {
  const { LL } = useI18nContext();

  const next = useQueryParam('next') ?? '/';

  // License selection - load from localStorage on mount
  const { data: accounts, isLoading: accountsLoading, error: accountsError } = useGetAccountsQuery();
  // Start with '' so the MUI Select never gets an out-of-range value during first render.
  // The saved account is restored once the accounts list has loaded and the value is validated.
  const [selectedLicense, setSelectedLicense] = useState<SelectedAccount>('');

  // Restore saved account after accounts have loaded and validated
  useEffect(() => {
    if (accountsLoading || !accounts) return;
    try {
      const saved = localStorage.getItem(LAST_SELECTED_ACCOUNT_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (parsed === 'admin') {
        setSelectedLicense('admin');
      } else if (typeof parsed === 'number' && accounts.some((a) => a.license === parsed)) {
        setSelectedLicense(parsed);
      } else {
        // Saved value is no longer valid — clean it up
        localStorage.removeItem(LAST_SELECTED_ACCOUNT_KEY);
      }
    } catch {
      // ignore
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountsLoading]);

  const redirectUrl = window.location.origin + next;

  // Calculate tenant license number before using it in queries
  const isAdminSelected = selectedLicense === 'admin';
  const isTenantSelected = typeof selectedLicense === 'number';
  const tenantLicenseNumber = isTenantSelected ? selectedLicense : null;

  const {
    data: oidcUrlData,
    isFetching: oidcLoading,
    error: oidcError,
  } = useGetOidcAuthUrlQuery(
    {
      redirect: redirectUrl,
      license: tenantLicenseNumber ?? undefined,
    },
    {
      skip: !isTenantSelected, // Only fetch when tenant is selected
    },
  );

  const {
    data: adminOidcUrlData,
    isFetching: adminOidcLoading,
    error: adminOidcError,
  } = useGetAdminOidcAuthUrlQuery(
    { redirect: window.location.origin + '/admin' },
    {
      skip: !isAdminSelected, // Only fetch when admin is selected
    },
  );

  const [errorText, setErrorText] = useState<string | null>(null);

  const onSelectLicense = (value: SelectedAccount) => {
    setSelectedLicense(value);
    setErrorText(null);

    // Save to localStorage
    try {
      if (value === '' || value === null) {
        localStorage.removeItem(LAST_SELECTED_ACCOUNT_KEY);
      } else {
        localStorage.setItem(LAST_SELECTED_ACCOUNT_KEY, JSON.stringify(value));
      }
    } catch (e) {
      console.error('Failed to save last selected account:', e);
    }
  };

  // Simple navigation helper — the dev proxy rewrites /rest and /oidc to the PHP server.
  const openUrl = (url: string | undefined) => {
    if (!url) return;
    window.location.assign(url);
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 2 }}>
      <Card sx={{ width: 480, maxWidth: '100%' }}>
        <CardContent>
          <Stack gap={2}>
            <Typography variant="h5">{LL.AUTH.LOGIN()}</Typography>

            {errorText && <Alert severity="error">{errorText}</Alert>}

            {accountsError && <Alert severity="error">{LL.ERRORS.LOAD_LICENSES()}</Alert>}

            <TextField
              select
              label={LL.AUTH.ACCOUNT()}
              value={selectedLicense}
              disabled={accountsLoading}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'admin' || v === '') {
                  onSelectLicense(v as SelectedAccount);
                } else {
                  onSelectLicense(Number(v));
                }
              }}
              helperText={LL.AUTH.SELECT_HELP()}
            >
              <MenuItem value="">{LL.AUTH.SELECT_PROMPT()}</MenuItem>
              <MenuItem value="admin">{LL.AUTH.ADMIN_LABEL()}</MenuItem>
              {(accounts ?? []).map((a) => (
                <MenuItem key={a.license} value={a.license}>
                  {a.name ? a.name : `#${a.license}`}
                </MenuItem>
              ))}
            </TextField>

            {selectedLicense === '' && (
              <Typography variant="body2" color="text.secondary">
                {LL.AUTH.SELECT_PROMPT()}
              </Typography>
            )}

            {selectedLicense !== '' && (
              <Stack gap={1}>
                <Button
                  fullWidth
                  variant="contained"
                  startIcon={<SecurityIcon />}
                  disabled={isAdminSelected ? adminOidcLoading : oidcLoading}
                  onClick={() => {
                    setErrorText(null);
                    const url = isAdminSelected ? adminOidcUrlData?.url : oidcUrlData?.url;
                    if (!url) {
                      setErrorText(isAdminSelected ? LL.ERRORS.ADMIN_CONFIG_MISSING() : LL.ERRORS.NO_PROVIDER_FOR_ACCOUNT());
                      return;
                    }
                    openUrl(url);
                  }}
                >
                  {LL.AUTH.LOGIN()}
                </Button>

                {isAdminSelected && adminOidcError && (
                  <Alert severity="error">
                    <Typography variant="subtitle2" gutterBottom>
                      {LL.ERRORS.ADMIN_OIDC_CONFIG()}
                    </Typography>
                    <Typography variant="body2">{LL.ERRORS.LOGIN_UNAVAILABLE()}</Typography>
                  </Alert>
                )}
                {isTenantSelected && oidcError && (
                  <Alert severity="error">
                    <Typography variant="subtitle2" gutterBottom>
                      {LL.ERRORS.PROVIDER_CONFIG()}
                    </Typography>
                    <Typography variant="body2">{LL.ERRORS.CONTACT_ADMIN_ASSIGN_PROVIDER()}</Typography>
                  </Alert>
                )}
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
};
