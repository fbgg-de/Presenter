/**
 * Human-readable names for the two-letter language codes songs are tagged with.
 *
 * `Intl.DisplayNames` already ships every locale the browser knows, so nothing is hard-coded
 * here and the names arrive in whatever language the UI is set to. Codes that mean nothing to
 * `Intl` (a house code someone typed into a song years ago) come back unchanged rather than
 * blank, so the editor can still show them.
 */

/** Codes are stored uppercase; `Intl` wants them lowercase. */
const cache = new Map<string, string>();

export const languageName = (code: string, uiLanguage: string): string => {
  const normalised = code.trim().toUpperCase();

  if (!normalised) return '';

  const key = `${uiLanguage}:${normalised}`;
  const cached = cache.get(key);
  if (cached) return cached;

  let name = normalised;

  try {
    const resolved = new Intl.DisplayNames([uiLanguage], { type: 'language' }).of(normalised.toLowerCase());
    // `of()` echoes the input back for codes it does not recognise — that is not a name.
    if (resolved && resolved.toLowerCase() !== normalised.toLowerCase()) {
      name = resolved.charAt(0).toUpperCase() + resolved.slice(1);
    }
  } catch {
    // Unsupported code or no ICU data — the bare code is a fine label.
  }

  cache.set(key, name);

  return name;
};

/** `"DE — German"`, or just `"DE"` when there is no name to add. */
export const languageLabel = (code: string, uiLanguage: string): string => {
  const name = languageName(code, uiLanguage);
  const normalised = code.trim().toUpperCase();

  return name === normalised ? normalised : `${normalised} — ${name}`;
};

/**
 * The codes offered when adding a language, ordered by name.
 *
 * ISO 639-1 covers what almost every library needs, so it is what the picker offers. It is not a
 * limit though: the tag format accepts two to five letters, so a code outside this list (a
 * regional or house code) can be typed in and will round-trip correctly.
 */
// prettier-ignore
export const ISO_639_1_CODES = [
  'AB', 'AA', 'AF', 'AK', 'SQ', 'AM', 'AR', 'AN', 'HY', 'AS', 'AV', 'AE', 'AY', 'AZ', 'BM', 'BA', 'EU', 'BE', 'BN', 'BI',
  'BS', 'BR', 'BG', 'MY', 'CA', 'CH', 'CE', 'NY', 'ZH', 'CU', 'CV', 'KW', 'CO', 'CR', 'HR', 'CS', 'DA', 'DV', 'NL', 'DZ',
  'EN', 'EO', 'ET', 'EE', 'FO', 'FJ', 'FI', 'FR', 'FY', 'FF', 'GD', 'GL', 'LG', 'KA', 'DE', 'EL', 'KL', 'GN', 'GU', 'HT',
  'HA', 'HE', 'HZ', 'HI', 'HO', 'HU', 'IS', 'IO', 'IG', 'ID', 'IA', 'IE', 'IU', 'IK', 'GA', 'IT', 'JA', 'JV', 'KN', 'KR',
  'KS', 'KK', 'KM', 'KI', 'RW', 'KY', 'KV', 'KG', 'KO', 'KJ', 'KU', 'LO', 'LA', 'LV', 'LI', 'LN', 'LT', 'LU', 'LB', 'MK',
  'MG', 'MS', 'ML', 'MT', 'GV', 'MI', 'MR', 'MH', 'MN', 'NA', 'NV', 'ND', 'NR', 'NG', 'NE', 'NO', 'NB', 'NN', 'II', 'OC',
  'OJ', 'OR', 'OM', 'OS', 'PI', 'PS', 'FA', 'PL', 'PT', 'PA', 'QU', 'RO', 'RM', 'RN', 'RU', 'SE', 'SM', 'SG', 'SA', 'SC',
  'SR', 'SN', 'SD', 'SI', 'SK', 'SL', 'SO', 'ST', 'ES', 'SU', 'SW', 'SS', 'SV', 'TL', 'TY', 'TG', 'TA', 'TT', 'TE', 'TH',
  'BO', 'TI', 'TO', 'TS', 'TN', 'TR', 'TK', 'TW', 'UG', 'UK', 'UR', 'UZ', 'VE', 'VI', 'VO', 'WA', 'CY', 'WO', 'XH', 'YI',
  'YO', 'ZA', 'ZU',
];

/** True when a code can be written into a song without being read back as lyrics. */
export const isValidLanguageCode = (code: string): boolean => /^[A-Za-z]{2,5}$/.test(code.trim());
