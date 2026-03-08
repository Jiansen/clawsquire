import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en.json';
import zhCN from './zh-CN.json';
import zhTW from './zh-TW.json';
import es from './es.json';
import ja from './ja.json';
import de from './de.json';
import ptBR from './pt-BR.json';

export const SUPPORTED_LOCALES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'zh-CN', name: '简体中文', flag: '🇨🇳' },
  { code: 'zh-TW', name: '繁體中文', flag: '🇭🇰' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'pt-BR', name: 'Português', flag: '🇧🇷' },
] as const;

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]['code'];

function detectLocale(): string {
  const saved = localStorage.getItem('clawsquire.locale');
  if (saved) return saved;
  const nav = navigator.language;
  if (nav.startsWith('zh-TW') || nav.startsWith('zh-Hant')) return 'zh-TW';
  if (nav.startsWith('zh')) return 'zh-CN';
  if (nav.startsWith('ja')) return 'ja';
  if (nav.startsWith('es')) return 'es';
  if (nav.startsWith('de')) return 'de';
  if (nav.startsWith('pt')) return 'pt-BR';
  return 'en';
}

i18next.use(initReactI18next).init({
  lng: detectLocale(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  resources: {
    en: { translation: en },
    'zh-CN': { translation: zhCN },
    'zh-TW': { translation: zhTW },
    es: { translation: es },
    ja: { translation: ja },
    de: { translation: de },
    'pt-BR': { translation: ptBR },
  },
});

export function changeLocale(code: string) {
  i18next.changeLanguage(code);
  localStorage.setItem('clawsquire.locale', code);
}

export default i18next;
