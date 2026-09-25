import { useEffect } from 'react';
import { useGetSessionQuery } from '@/api/session.api';
import { getNextcloud, setNextcloud, useNextcloud } from './connection';

/**
 * Forgets this browser's Nextcloud connection once it no longer matches the signed-in account:
 * another account signed in here, or an admin changed or removed the account's Nextcloud.
 * Mounted where the operator works (web version); presentation windows follow through storage.
 */
export function useNextcloudAccountCheck(skip = false): void {
  const { data: session } = useGetSessionQuery(undefined, { skip });
  const connection = useNextcloud();

  useEffect(() => {
    if (skip || !session?.isAuthenticated || !connection) return;
    const accountServer = session.settings?.nextcloudUrl ?? null;
    const sameAccount = connection.account === undefined || connection.account === session.account;
    if (sameAccount && accountServer && sameServer(connection.server, accountServer)) return;
    if (getNextcloud() === connection) setNextcloud(null);
  }, [skip, session, connection]);
}

const sameServer = (a: string, b: string) => a.replace(/\/+$/, '').toLowerCase() === b.replace(/\/+$/, '').toLowerCase();
