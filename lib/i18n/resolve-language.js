import { getMarketConfig } from '@/lib/market-utils';
import { AVAILABLE_LANGUAGES } from '@/lib/i18n/load-messages';

/**
 * Language code from market (e.g. XK → sq, FI → fi).
 * @param {string|null|undefined} market
 * @returns {string}
 */
export function getLanguageFromMarket(market) {
  if (!market) return 'en';
  const config = getMarketConfig(market);
  if (config?.locale) {
    const code = config.locale.split('-')[0]?.toLowerCase();
    if (code) return code;
  }
  return 'en';
}

/**
 * Effective UI language: English override cookie, else market default.
 * If the resolved language has no message file, returns 'en'.
 *
 * @param {string|null|undefined} languageCookie - only 'en' is a valid override
 * @param {string|null|undefined} marketCookie
 * @returns {string}
 */
export function resolveLanguage(languageCookie, marketCookie) {
  if (languageCookie === 'en') {
    return 'en';
  }

  const fromMarket = getLanguageFromMarket(marketCookie);
  if (AVAILABLE_LANGUAGES.includes(fromMarket)) {
    return fromMarket;
  }

  // Market language not yet translated → English
  return 'en';
}

/**
 * Local language for the current market (for toggle UI), even if catalog missing.
 * @param {string|null|undefined} market
 * @returns {string}
 */
export function getLocalLanguage(market) {
  return getLanguageFromMarket(market);
}

/**
 * Whether a language toggle (local ↔ en) should be shown.
 * Only when market local language has a catalog and is not English.
 */
export function canToggleLanguage(market) {
  const local = getLanguageFromMarket(market);
  return local !== 'en' && AVAILABLE_LANGUAGES.includes(local);
}
