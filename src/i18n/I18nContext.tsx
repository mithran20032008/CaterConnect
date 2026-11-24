import React, {createContext, useContext, useEffect, useState} from 'react';
import en from './en.json';
import ta from './ta.json';

export type Language = 'en' | 'ta';

type Dict = Record<string, unknown>;

const dicts: Record<Language, Dict> = {en, ta};

interface I18nContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  hasChosenLang: boolean;
  markLangChosen: () => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const LANG_KEY = 'cc_lang';
const LANG_CHOSEN_KEY = 'cc_lang_chosen';

export const I18nProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [lang, setLangState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      return saved === 'ta' ? 'ta' : 'en';
    } catch {
      return 'en';
    }
  });

  const [hasChosenLang, setHasChosenLang] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LANG_CHOSEN_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      // ignore storage errors
    }
  }, [lang]);

  const setLang = (next: Language) => {
    setLangState(next);
  };

  const markLangChosen = () => {
    setHasChosenLang(true);
    try {
      localStorage.setItem(LANG_CHOSEN_KEY, '1');
    } catch {
      // ignore
    }
  };

  const t = (key: string, vars?: Record<string, string | number>): string => {
    const parts = key.split('.');
    let node: unknown = dicts[lang];
    for (const p of parts) {
      if (node && typeof node === 'object' && p in (node as Dict)) {
        node = (node as Dict)[p];
      } else {
        node = undefined;
        break;
      }
    }
    if (typeof node !== 'string') {
      // Fallback to English
      let enNode: unknown = dicts.en;
      for (const p of parts) {
        if (enNode && typeof enNode === 'object' && p in (enNode as Dict)) {
          enNode = (enNode as Dict)[p];
        } else {
          enNode = undefined;
          break;
        }
      }
      node = typeof enNode === 'string' ? enNode : key;
    }
    let str = node as string;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replaceAll(`{{${k}}}`, String(v));
      }
    }
    return str;
  };

  return (
    <I18nContext.Provider value={{lang, setLang, t, hasChosenLang, markLangChosen}}>
      {children}
    </I18nContext.Provider>
  );
};

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
