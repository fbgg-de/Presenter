import { useEffect } from 'react';
import { useGetSessionQuery } from '@/api/session.api';
import { getNextcloud, setNextcloud } from './connection';

/**
 * Forgets this browser's Nextcloud connection once it no longer matches the signed-in account:
 * another account signed in here, or an admin changed or removed the account's Nextcloud.
 * Mounted where the operator works (web version); presentation windows follow through storage.
 *
 * Checked when this window learns the session, not when the connection changes: a connection
 * made in another tab was made with that tab's fresh session, and an idle tab holding an older
 * one must not throw it away — it did, and the folder picker vanished right after connecting.
 */
export function useNextcloudAccountCheck(skip = false): void {
  const { data: session } = useGetSessionQuery(undefined, { skip });

  useEffect(() => {
    const connection = getNextcloud();
    if (skip || !session?.isAuthenticated || !connection) return;
    const accountServer = session.settings?.nextcloudUrl ?? null;
    const sameAccount = connection.account === undefined || connection.account === session.account;
    if (sameAccount && accountServer && sameServer(connection.server, accountServer)) return;
    setNextcloud(null);
  }, [skip, session]);
}

const sameServer = (a: string, b: string) => a.replace(/\/+$/, '').toLowerCase() === b.replace(/\/+$/, '').toLowerCase();
