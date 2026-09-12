'use client';

import { getLanguageFromMarket, resolveLanguage } from '@/lib/i18n/resolve-language';

function readCookie(name) {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return match ? match.split('=').slice(1).join('=') : null;
}

/**
 * Get user's language based on market/location + optional English override cookie.
 */
export function getLanguage() {
  if (typeof document === 'undefined') {
    return 'en';
  }

  return resolveLanguage(readCookie('language'), readCookie('market'));
}

/**
 * Set language preference cookie.
 * - 'en' → force English
 * - local language code or null → clear override (use market default)
 */
export function setLanguage(language) {
  if (typeof document === 'undefined') return;

  const local = getLanguageFromMarket(readCookie('market'));

  if (language === 'en') {
    const expiryDate = new Date();
    expiryDate.setTime(expiryDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    document.cookie = `language=en; expires=${expiryDate.toUTCString()}; path=/; sameSite=lax`;
    return;
  }

  // Switching back to local (or clearing) — remove override cookie
  if (language == null || language === local || language === 'local') {
    document.cookie = 'language=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; sameSite=lax';
    return;
  }

  console.warn(`[i18n] Language override only supports 'en' or local clear, got: ${language}`);
}

export function clearLanguageOverride() {
  setLanguage(null);
}
