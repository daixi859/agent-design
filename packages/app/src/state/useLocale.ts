/** 语言订阅 hook：Appearance 分段控件为唯一写入口（ADR-0011），事件驱动同步 */
import { useCallback, useEffect, useState } from "react";
import {
  LOCALE_CHANGE_EVENT,
  applyLocale,
  currentLocale,
  translate,
  type Locale,
  type MessageKey,
} from "../lib/i18n";

export function useLocale(): {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey) => string;
} {
  const [locale, setLocaleState] = useState<Locale>(currentLocale);

  useEffect(() => {
    const sync = () => setLocaleState(currentLocale());
    window.addEventListener(LOCALE_CHANGE_EVENT, sync);
    return () => window.removeEventListener(LOCALE_CHANGE_EVENT, sync);
  }, []);

  const setLocale = useCallback((next: Locale) => applyLocale(next), []);
  const t = useCallback((key: MessageKey) => translate(locale, key), [locale]);
  return { locale, setLocale, t };
}
