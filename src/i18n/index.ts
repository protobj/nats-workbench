/**
 * @file 集成了 React、浏览器语言检测以及中英文资源包的 i18next 配置。
 * 导出供 settings store 和 React 组件使用的 i18n 实例。
 */

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import en from './locales/en.json'
import zh from './locales/zh.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      zh: { translation: zh },
    },
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })

export default i18n
