/**
 * Which language a piece of lyric text is written in.
 *
 * Built for one specific question — "what language are this song's untagged lines?" — and that
 * shapes everything here. It runs over a **whole song**, not a line at a time: a four-word lyric
 * line is close to undetectable, while a few hundred words of the same text is easy. And it is
 * normally given a short candidate list (the account's language pool), which turns a hard
 * open-set problem into an easy two- or three-way choice.
 *
 * The method is function-word frequency, not n-grams. Lyrics are dense in exactly the words that
 * separate languages — der/die/das against the/and/is — so counting them over song-length text
 * is both accurate and completely transparent about why it decided what it did. Scripts are
 * settled first, since a Cyrillic or Greek text needs no counting at all.
 *
 * Genuinely close pairs stay close: Danish against Norwegian is hard for any detector, and this
 * one reports low confidence rather than guessing. That is what the caller asks the user about.
 */

/** A ranked guess. `confidence` is 0–1; see {@link CONFIDENT_THRESHOLD}. */
export type LanguageGuess = {
  language: string;
  /** Raw evidence score — how much of the text looked like this language. */
  score: number;
  /** How much better this is than the runner-up, scaled by how much text there was. */
  confidence: number;
};

/**
 * Above this, a guess is applied without asking. Chosen so a clear two-way decision over a full
 * song passes easily, while a near-tie or a handful of words does not.
 */
export const CONFIDENT_THRESHOLD = 0.5;

/** Below this score nothing recognisable was found, whatever the ranking says. */
const MIN_SCORE = 0.02;

/**
 * What a real match scores. Measured, not guessed: over song-length text the right language
 * lands between 0.27 and 0.57, while every wrong one sits between 0.02 and 0.12. Anything at or
 * above this is treated as full evidence; below it, confidence is scaled down proportionally.
 */
const STRONG_SCORE = 0.15;

/**
 * Writing systems that identify a language on their own. Checked before any word counting —
 * a Greek text is Greek regardless of which words it uses.
 *
 * Ranges that several languages share (Cyrillic, Han) resolve to the most common one and are
 * reported with reduced confidence, so the caller still asks when it matters.
 */
const SCRIPTS: { pattern: RegExp; language: string; certain: boolean }[] = [
  { pattern: /[Ͱ-Ͽἀ-῿]/, language: 'EL', certain: true },
  { pattern: /[֐-׿]/, language: 'HE', certain: true },
  { pattern: /[؀-ۿ]/, language: 'AR', certain: true },
  { pattern: /[฀-๿]/, language: 'TH', certain: true },
  { pattern: /[ऀ-ॿ]/, language: 'HI', certain: true },
  { pattern: /[가-힯ᄀ-ᇿ]/, language: 'KO', certain: true },
  { pattern: /[぀-ゟ゠-ヿ]/, language: 'JA', certain: true },
  // Cyrillic and Han are shared; the language is a guess, the script is not.
  { pattern: /[Ѐ-ӿ]/, language: 'RU', certain: false },
  { pattern: /[一-鿿]/, language: 'ZH', certain: false },
];

/**
 * The most common function words per language. Content words are deliberately absent: they say
 * what a song is about, not what language it is in, and a hymn vocabulary would skew badly.
 */
// prettier-ignore
const STOPWORDS: Record<string, string[]> = {
  EN: ['the', 'and', 'of', 'to', 'a', 'in', 'is', 'i', 'you', 'my', 'we', 'that', 'for', 'it', 'with', 'your', 'me', 'be', 'are', 'will', 'all', 'this', 'he', 'his', 'not', 'on', 'but', 'have', 'from', 'as', 'so', 'our', 'us', 'they', 'by', 'was', 'there', 'when', 'who', 'what'],
  DE: ['der', 'die', 'das', 'und', 'ist', 'ich', 'du', 'wir', 'nicht', 'ein', 'eine', 'den', 'dem', 'zu', 'in', 'mit', 'von', 'für', 'auf', 'ihr', 'sie', 'er', 'es', 'hat', 'mein', 'dein', 'sein', 'aus', 'wie', 'so', 'dass', 'was', 'im', 'am', 'mich', 'dir', 'uns', 'nur', 'noch', 'wird', 'sind', 'war', 'kann', 'doch', 'denn', 'auch'],
  NL: ['de', 'het', 'een', 'en', 'van', 'ik', 'je', 'is', 'in', 'dat', 'die', 'niet', 'te', 'zijn', 'op', 'met', 'voor', 'uw', 'mijn', 'wij', 'aan', 'ook', 'maar', 'om', 'ze', 'er', 'heeft', 'wordt', 'zo', 'als', 'door', 'naar', 'bij', 'wat', 'hij', 'jij', 'wie'],
  FR: ['le', 'la', 'les', 'de', 'des', 'du', 'et', 'un', 'une', 'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'est', 'sont', 'ne', 'pas', 'que', 'qui', 'dans', 'pour', 'sur', 'avec', 'mon', 'ma', 'mes', 'ton', 'son', 'ses', 'au', 'aux', 'en', 'ce', 'cette', 'plus', 'tout', 'toute', 'nos'],
  ES: ['el', 'la', 'los', 'las', 'de', 'del', 'y', 'un', 'una', 'que', 'en', 'es', 'no', 'mi', 'tu', 'su', 'por', 'para', 'con', 'se', 'me', 'te', 'lo', 'al', 'más', 'como', 'tus', 'mis', 'sus', 'eres', 'soy', 'está', 'hay', 'todo', 'todos', 'nos', 'si', 'ya', 'yo'],
  IT: ['il', 'lo', 'la', 'i', 'gli', 'le', 'di', 'del', 'e', 'un', 'una', 'che', 'in', 'è', 'non', 'per', 'con', 'mi', 'ti', 'si', 'ci', 'sei', 'sono', 'ha', 'hai', 'mio', 'tuo', 'suo', 'tutto', 'come', 'ma', 'se', 'da', 'al', 'nel', 'più', 'io'],
  PT: ['o', 'a', 'os', 'as', 'de', 'do', 'da', 'dos', 'das', 'e', 'um', 'uma', 'que', 'em', 'é', 'não', 'para', 'com', 'me', 'te', 'se', 'meu', 'teu', 'seu', 'minha', 'tua', 'sua', 'no', 'na', 'por', 'mais', 'como', 'mas', 'todo', 'tu', 'eu', 'você', 'nós'],
  PL: ['i', 'w', 'na', 'z', 'nie', 'to', 'jest', 'się', 'że', 'do', 'ty', 'ja', 'my', 'mnie', 'ciebie', 'twoje', 'moje', 'jak', 'po', 'za', 'od', 'ale', 'już', 'tylko', 'gdy', 'bo', 'przez', 'są', 'był', 'będzie', 'cię', 'mi', 'ci', 'jego'],
  CS: ['a', 'v', 'na', 'se', 'je', 'že', 'to', 's', 'z', 'do', 'ty', 'já', 'my', 'ne', 'ale', 'jak', 'pro', 'od', 'za', 'po', 've', 'si', 'mi', 'tvé', 'mé', 'jsi', 'jsem', 'jsou', 'byl', 'bude', 'který'],
  SK: ['a', 'v', 'na', 'sa', 'je', 'že', 'to', 's', 'z', 'do', 'ty', 'ja', 'my', 'nie', 'ale', 'ako', 'pre', 'od', 'za', 'po', 'vo', 'si', 'mi', 'tvoj', 'môj', 'som', 'sú', 'bol', 'bude', 'ktorý'],
  HU: ['a', 'az', 'és', 'egy', 'hogy', 'nem', 'is', 'én', 'te', 'mi', 'ti', 'ő', 'van', 'meg', 'de', 'csak', 'már', 'még', 'ha', 'mint', 'el', 'be', 'ki', 'fel', 'le', 'ez', 'azt', 'minden', 'vagy'],
  RO: ['și', 'de', 'la', 'în', 'cu', 'pe', 'un', 'o', 'este', 'nu', 'că', 'se', 'mă', 'te', 'tu', 'eu', 'noi', 'voi', 'mai', 'sunt', 'ai', 'are', 'tău', 'meu', 'tot', 'care', 'din', 'pentru', 'ne'],
  SV: ['och', 'i', 'att', 'det', 'som', 'en', 'på', 'är', 'av', 'för', 'med', 'till', 'den', 'om', 'du', 'jag', 'vi', 'inte', 'han', 'hon', 'min', 'din', 'ditt', 'mitt', 'ett', 'har', 'kan', 'ska', 'så', 'men', 'de'],
  DA: ['og', 'i', 'at', 'det', 'som', 'en', 'på', 'er', 'af', 'for', 'med', 'til', 'den', 'om', 'du', 'jeg', 'vi', 'ikke', 'han', 'hun', 'min', 'din', 'dit', 'mit', 'et', 'har', 'kan', 'skal', 'så', 'men', 'de'],
  NO: ['og', 'i', 'å', 'det', 'som', 'en', 'på', 'er', 'av', 'for', 'med', 'til', 'den', 'om', 'du', 'jeg', 'vi', 'ikke', 'han', 'hun', 'min', 'din', 'ditt', 'mitt', 'et', 'har', 'kan', 'skal', 'så', 'men', 'de'],
  FI: ['ja', 'on', 'ei', 'se', 'että', 'en', 'sinä', 'minä', 'me', 'te', 'hän', 'kun', 'niin', 'mutta', 'jos', 'kuin', 'oli', 'ovat', 'sinun', 'minun', 'tämä', 'joka', 'vain', 'myös', 'olen'],
  TR: ['ve', 'bir', 'bu', 'için', 'ile', 'ben', 'sen', 'biz', 'siz', 'var', 'yok', 'ama', 'gibi', 'çok', 'daha', 'her', 'ne', 'mi', 'de', 'da', 'senin', 'benim', 'o'],
  ID: ['dan', 'yang', 'di', 'ke', 'dari', 'untuk', 'dengan', 'ini', 'itu', 'aku', 'kamu', 'kami', 'kita', 'engkau', 'tidak', 'akan', 'ada', 'adalah', 'kau', 'pada', 'oleh', 'dalam'],
  AF: ['die', 'en', 'van', 'in', 'is', 'nie', 'wat', 'my', 'jy', 'ons', 'met', 'vir', 'op', 'te', 'het', 'sal', 'ek', 'hy', 'sy', 'dit', 'hulle', 'om', 'se', 'as'],
  SW: ['na', 'ya', 'wa', 'kwa', 'ni', 'katika', 'kwenye', 'sisi', 'wewe', 'mimi', 'yako', 'yangu', 'hii', 'hiyo', 'si', 'lakini', 'kama', 'la', 'za'],
};

/**
 * Characters that belong to one language and essentially no other in this set. Finding one is
 * strong evidence on its own — useful exactly when a text is too short for word counting to
 * separate two close neighbours.
 */
const EXCLUSIVE_MARKERS: Record<string, RegExp> = {
  DE: /[ß]/,
  ES: /[ñ¿¡]/,
  PT: /[ãõ]/,
  FR: /[çœ]/,
  PL: /[łąęźż]/,
  CS: /[řěůď]/,
  SK: /[ľĺŕô]/,
  HU: /[őű]/,
  RO: /[șțăî]/,
  TR: /[ğışİ]/,
  DA: /[øæ]/,
  NO: /[øæ]/,
  FI: /[äö]/,
  SV: /[åäö]/,
};

/** Every language this can name. */
export const DETECTABLE_LANGUAGES = [...Object.keys(STOPWORDS), ...SCRIPTS.map((s) => s.language)].filter(
  (code, index, all) => all.indexOf(code) === index,
);

/**
 * How much one function word is worth as evidence: `1 / (languages that use it)`.
 *
 * Without this, close relatives drown each other out. Dutch and Afrikaans share `die en van in
 * is met ons op`, so counting raw hits scores them almost identically and the detector reports a
 * coin flip on text that is plainly one or the other. Weighting each word by how many languages
 * claim it lets the few words that only Dutch uses decide, which is how a reader tells them
 * apart too. Shared filler like `in` or `a` ends up worth very little.
 */
const WORD_WEIGHT: Map<string, number> = (() => {
  const frequency = new Map<string, number>();

  for (const words of Object.values(STOPWORDS)) {
    for (const word of new Set(words)) frequency.set(word, (frequency.get(word) ?? 0) + 1);
  }

  return new Map([...frequency].map(([word, count]) => [word, 1 / count]));
})();

const tokenise = (text: string): string[] => text.toLowerCase().match(/[\p{L}']+/gu) ?? [];

const clamp = (value: number) => Math.max(0, Math.min(1, value));

/**
 * Rank the languages `text` might be in, best first.
 *
 * `candidates` narrows the field to the codes the caller can actually use (the account's pool);
 * anything outside it is not considered, which is what makes a two-way call so reliable. Pass
 * nothing to score against every known language.
 *
 * Returns an empty array when there is nothing to go on — no words, or no candidate scored above
 * the floor. An empty result means "ask", never "English".
 */
export const detectLanguage = (text: string, candidates?: string[]): LanguageGuess[] => {
  const wanted = candidates?.map((code) => code.toUpperCase()).filter((code) => code !== '');
  const allowed = (code: string) => !wanted || wanted.length === 0 || wanted.includes(code);

  // A distinctive script settles it before any counting.
  for (const script of SCRIPTS) {
    if (!script.pattern.test(text) || !allowed(script.language)) continue;
    return [{ language: script.language, score: 1, confidence: script.certain ? 1 : 0.4 }];
  }

  const tokens = tokenise(text);
  if (tokens.length === 0) return [];

  const pool = Object.keys(STOPWORDS).filter(allowed);
  const scored = pool.map((language) => {
    const words = new Set(STOPWORDS[language]);
    const hits = tokens.reduce((total, token) => total + (words.has(token) ? (WORD_WEIGHT.get(token) ?? 1) : 0), 0);
    const marker = EXCLUSIVE_MARKERS[language];

    return {
      language,
      score: hits / tokens.length + (marker && marker.test(text) ? 0.08 : 0),
    };
  });

  scored.sort((a, b) => b.score - a.score);

  const top = scored[0];
  if (!top || top.score < MIN_SCORE) return [];

  const second = scored[1]?.score ?? 0;
  // How decisive the win was, discounted when there was barely any text to judge from. Song
  // blocks are short; a whole song comfortably clears the volume term.
  const margin = (top.score - second) / top.score;
  const volume = Math.min(1, tokens.length / 30);
  // Margin alone is not enough: a language that barely matches still wins by a mile when
  // nothing else is in the running, and would otherwise be reported as near-certain. German
  // text scored against a French/Spanish pool did exactly that. Absolute evidence has to
  // count too — a real match lands well above STRONG_SCORE, noise sits around a tenth of it.
  const strength = Math.min(1, top.score / STRONG_SCORE);

  return scored
    .filter((entry) => entry.score >= MIN_SCORE)
    .map((entry, index) => ({
      language: entry.language,
      score: entry.score,
      confidence: index === 0 ? clamp(margin * volume * strength) : 0,
    }));
};

/** The single best guess, or `undefined` when there was nothing to go on. */
export const bestGuess = (text: string, candidates?: string[]): LanguageGuess | undefined => detectLanguage(text, candidates)[0];
