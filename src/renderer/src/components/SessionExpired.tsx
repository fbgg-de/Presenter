import { useEffect, useState, useCallback } from 'react';
import { Snackbar, Alert, Button } from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import { SESSION_EXPIRED_EVENT } from '@/api/base.api';

const SessionExpired = () => {
  const { LL } = useI18nContext();

  const [open, setOpen] = useState(false);
  const handleRelogin = useCallback(() => {
    setOpen(false);
    window.location.href = '/login';
  }, []);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(SESSION_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
  }, []);

  return (
    <Snackbar open={open} anchorOrigin={{ vertical: 'top', horizontal: 'center' }} onClose={() => setOpen(false)}>
      <Alert
        severity="warning"
        variant="filled"
        onClose={() => setOpen(false)}
        action={
          <Button color="inherit" size="small" onClick={handleRelogin}>
            {LL.AUTH.LOGIN()}
          </Button>
        }
      >
        {LL.AUTH.SESSION_EXPIRED()}
      </Alert>
    </Snackbar>
  );
};

export default SessionExpired;
