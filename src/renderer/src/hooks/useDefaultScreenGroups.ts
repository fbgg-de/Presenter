/**
 * Give an account that has never set one up its starting pair of screen groups.
 *
 * Screen groups are what windows are assigned to, so until one exists nothing an operator opens
 * can be told what to show. Making that the first task of a new account — decide on outputs
 * before having seen a single slide — is the wrong order; everyone wants the same two to begin
 * with, a normal presentation and a stage monitor.
 *
 * The names are sent from here so they arrive in the operator's language; the server holds the
 * rule that decides whether to create them at all (only while the account has none), which is
 * what keeps two devices starting at the same time from creating four groups.
 */
import { useEffect, useRef } from 'react';
import { useGetScreenGroupsQuery, useSeedDefaultScreenGroupsMutation } from '@/api/screenGroups.api';
import { useI18nContext } from '@/i18n/i18n-react';

export function useDefaultScreenGroups(): void {
  const { LL } = useI18nContext();
  const { data: groups, isSuccess } = useGetScreenGroupsQuery();
  const [seed] = useSeedDefaultScreenGroupsMutation();
  // Once per renderer: a failed request (offline) must not turn into a retry loop, and a
  // successful one is answered by the list refetch rather than by this effect running again.
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current || !isSuccess || !groups || groups.length > 0) return;
    asked.current = true;
    void seed({ audience: LL.SCREEN_GROUP.KIND_AUDIENCE(), stage: LL.SCREEN_GROUP.KIND_STAGE() })
      .unwrap()
      .catch(() => {
        // Nothing to report: the board still works, it just starts empty.
      });
  }, [isSuccess, groups, seed, LL]);
}
