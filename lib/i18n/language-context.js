'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { loadMessages, translate } from '@/lib/i18n/load-messages';
import { getLocalLanguage, canToggleLanguage } from '@/lib/i18n/resolve-language';
import { setLanguage as persistLanguage } from '@/lib/get-language';
import { getMarket } from '@/lib/get-market';

const LanguageContext = createContext({
  language: 'en',
  messages: {},
  t: (key) => key,
  setUiLanguage: async () => {},
  localLanguage: 'en',
  showLanguageToggle: false,
});

export function LanguageProvider({
  children,
  initialLanguage = 'en',
  initialMessages = {},
  initialMarket = 'XK',
}) {
  const [language, setLanguageState] = useState(initialLanguage);
  const [messages, setMessages] = useState(initialMessages);

  const market =
    typeof window !== 'undefined' ? getMarket() || initialMarket : initialMarket;
  const localLanguage = getLocalLanguage(market);
  const showLanguageToggle = canToggleLanguage(market);

  const t = useCallback(
    (key, params) => translate(messages, key, params),
    [messages]
  );

  const setUiLanguage = useCallback(async (nextLang) => {
    persistLanguage(nextLang === 'en' ? 'en' : 'local');
    const loaded = await loadMessages(nextLang);
    setMessages(loaded);
    setLanguageState(nextLang);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = nextLang;
    }
  }, []);

  const value = useMemo(
    () => ({
      language,
      messages,
      t,
      setUiLanguage,
      localLanguage,
      showLanguageToggle,
    }),
    [language, messages, t, setUiLanguage, localLanguage, showLanguageToggle]
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function useT() {
  return useLanguage().t;
}
