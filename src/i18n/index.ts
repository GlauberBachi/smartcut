import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const defaultLanguage = 'en';

import enTranslations from './locales/en.json';
import ptTranslations from './locales/pt.json';
import esTranslations from './locales/es.json';
import itTranslations from './locales/it.json';
import frTranslations from './locales/fr.json';
import deTranslations from './locales/de.json';
import zhTranslations from './locales/zh.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    lng: defaultLanguage,
    resources: {
      en: {
        translation: enTranslations
      },
      pt: {
        translation: ptTranslations
      },
      es: {
        translation: esTranslations
      },
      it: {
        translation: itTranslations
      },
      fr: {
        translation: frTranslations
      },
      de: {
        translation: deTranslations
      },
      zh: {
        translation: zhTranslations
      }
    },
    fallbackLng: defaultLanguage,
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;