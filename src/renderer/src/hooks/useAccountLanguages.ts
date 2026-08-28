import { useMemo } from 'react';
import { useGetAccountSettingsQuery } from '@/api/session.api';
import { useGetLanguageTagsQuery } from '@/api/songs.api';
import { LANGUAGE_CODE_REGEX } from '@/song';

/**
 * The languages the song editor may offer.
 *
 * `pool` is what the account configured in the settings — the authoritative list. `inUse` is
 * what `rest/LanguageTags` scraped out of the songs that are already stored; those codes are
 * merged in so a library that predates the setting still edits correctly, and so the settings
 * panel can suggest adding them properly.
 */
export const useAccountLanguages = () => {
  const { data: accountSettings, isLoading: settingsLoading } = useGetAccountSettingsQuery();
  const { data: detected, isLoading: tagsLoading } = useGetLanguageTagsQuery();

  return useMemo(() => {
    const pool = (accountSettings?.languages ?? []).map((code) => code.toUpperCase());
    const inUse = (detected ?? []).map((code) => code.toUpperCase()).filter((code) => LANGUAGE_CODE_REGEX.test(code));

    // Codes found in songs but never configured. Offered by the editor regardless, because
    // hiding them would hide lyrics that are already there.
    const unconfigured = inUse.filter((code) => !pool.includes(code));
    const available = [...pool, ...unconfigured];

    return {
      /** Configured pool, in the account's chosen order. */
      pool,
      /** Configured pool plus anything already used in a song. Never empty. */
      available: available.length > 0 ? available : ['EN'],
      /** Used by a song but missing from the pool — the settings panel offers to add these. */
      unconfigured,
      /** The language a new song starts in. */
      defaultLanguage: pool[0] ?? available[0] ?? 'EN',
      isLoading: settingsLoading || tagsLoading,
    };
  }, [accountSettings?.languages, detected, settingsLoading, tagsLoading]);
};
