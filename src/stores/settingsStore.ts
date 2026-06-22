/**
 * @file 用于 UI 设置（深色模式、侧边栏折叠、语言）的 Zustand store。
 * 自动将变更持久化到 Tauri plugin-store JSON 文件，并与 i18n 语言同步。
 */

import { create } from 'zustand'
import { load, type Store } from '@tauri-apps/plugin-store'
import i18n from '@/i18n'
import { logger } from '@/utils/logger'

/** 持久化到磁盘并与 i18next 保持同步的 UI 级设置。 */
interface SettingsState {
  darkMode: boolean
  sidebarCollapsed: boolean
  language: string
  toggleDarkMode: () => void
  toggleSidebar: () => void
  setLanguage: (lang: string) => void
  init: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  let store: Store | null = null

  async function persist(darkMode: boolean, collapsed: boolean, lang: string) {
    if (!store) store = await load('settings.json')
    await store.set('settings', { darkMode, sidebarCollapsed: collapsed, language: lang })
    await store.save()
  }

  return {
    darkMode: true,
    sidebarCollapsed: false,
    language: 'en',

    toggleDarkMode: () => {
      const next = !get().darkMode
      logger.info('Dark mode toggled')
      set({ darkMode: next })
      persist(next, get().sidebarCollapsed, get().language)
    },

    toggleSidebar: () => {
      const next = !get().sidebarCollapsed
      set({ sidebarCollapsed: next })
      persist(get().darkMode, next, get().language)
    },

    setLanguage: (lang: string) => {
      logger.info('Language changed', { lang })
      i18n.changeLanguage(lang)
      set({ language: lang })
      persist(get().darkMode, get().sidebarCollapsed, lang)
    },

    init: async () => {
      store = await load('settings.json')
      const saved = await store.get<{ darkMode?: boolean; sidebarCollapsed?: boolean; language?: string }>('settings')
      if (saved) {
        set({
          darkMode: saved.darkMode ?? true,
          sidebarCollapsed: saved.sidebarCollapsed ?? false,
          language: saved.language ?? 'en',
        })
        if (saved.language) {
          i18n.changeLanguage(saved.language)
        }
      }
      logger.info('Settings loaded')
    },
  }
})
