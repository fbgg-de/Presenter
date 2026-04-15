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
  const [selectedLicense, setSelectedLicense] = useState<SelectedAccount>(() => {
    try {
      const saved = localStorage.getItem(LAST_SELECTED_ACCOUNT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed === 'admin' ? 'admin' : typeof parsed === 'number' ? parsed : '';
      }
    } catch (e) {
      console.error('Failed to load last selected account:', e);
    }
    return '';
  });

  // Validate saved selection when accounts are loaded
  useEffect(() => {
    if (!accountsLoading && accounts && selectedLicense !== '' && selectedLicense !== 'admin') {
      const accountExists = accounts.some((a) => a.license === selectedLicense);
      if (!accountExists) {
        console.warn('Previously selected account no longer exists, resetting selection');
        setSelectedLicense('');
        localStorage.removeItem(LAST_SELECTED_ACCOUNT_KEY);
      }
    }
  }, [accounts, accountsLoading, selectedLicense]);

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
            <Typography variant="h5">{LL.LOGIN()}</Typography>

            {errorText && <Alert severity="error">{errorText}</Alert>}

            {accountsError && <Alert severity="error">{LL.ERROR_LOAD_LICENSES()}</Alert>}

            <TextField
              select
              label={LL.ACCOUNT()}
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
              helperText={LL.SELECT_HELP()}
            >
              <MenuItem value="">{LL.SELECT_PROMPT()}</MenuItem>
              <MenuItem value="admin">{LL.ADMIN_LABEL()}</MenuItem>
              {(accounts ?? []).map((a) => (
                <MenuItem key={a.license} value={a.license}>
                  {a.name ? a.name : `#${a.license}`}
                </MenuItem>
              ))}
            </TextField>

            {selectedLicense === '' && (
              <Typography variant="body2" color="text.secondary">
                {LL.SELECT_PROMPT()}
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
                      setErrorText(isAdminSelected ? LL.ERROR_ADMIN_CONFIG_MISSING() : LL.ERROR_NO_PROVIDER_FOR_ACCOUNT());
                      return;
                    }
                    openUrl(url);
                  }}
                >
                  {LL.LOGIN()}
                </Button>

                {isAdminSelected && adminOidcError && (
                  <Alert severity="error">
                    <Typography variant="subtitle2" gutterBottom>
                      {LL.ERROR_ADMIN_OIDC_CONFIG()}
                    </Typography>
                    <Typography variant="body2">{LL.ERROR_LOGIN_UNAVAILABLE()}</Typography>
                  </Alert>
                )}
                {isTenantSelected && oidcError && (
                  <Alert severity="error">
                    <Typography variant="subtitle2" gutterBottom>
                      {LL.ERROR_PROVIDER_CONFIG()}
                    </Typography>
                    <Typography variant="body2">{LL.ERROR_CONTACT_ADMIN_ASSIGN_PROVIDER()}</Typography>
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
