/**
 * @file 管理 NATS 连接配置（增删改查、导入导出）和活跃连接生命周期
 * （连接、断开、状态监听、切换）的 Zustand store。
 */

import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { ConnectionConfig, ConnectionStatus, ConnectionSummary } from '@/types'

/** 已保存的连接配置和活跃 NATS 连接的状态与操作。 */
interface ConnectionState {
  savedConfigs: ConnectionConfig[]
  activeStatuses: Map<string, ConnectionStatus>
  currentConnectionId: string | null
  connecting: boolean
  unlisten: UnlistenFn | null

  loadConfigs: () => Promise<void>
  saveConfig: (config: ConnectionConfig) => Promise<void>
  deleteConfig: (id: string) => Promise<void>
  exportConfig: (id: string) => Promise<string>
  importConfig: (json: string) => Promise<void>
  connect: (config: ConnectionConfig) => Promise<ConnectionStatus>
  disconnect: (id: string) => Promise<void>
  testConnection: (config: ConnectionConfig) => Promise<string>
  refreshActiveConnections: () => Promise<void>
  startStatusListener: () => Promise<void>
  stopStatusListener: () => void
  switchConnection: (id: string) => void
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  savedConfigs: [],
  activeStatuses: new Map(),
  currentConnectionId: null,
  connecting: false,
  unlisten: null,

  loadConfigs: async () => {
    try {
      const configs = await invoke<ConnectionConfig[]>('list_configs')
      set({ savedConfigs: configs })
    } catch (e) {
      console.error('Failed to load configs:', e)
    }
  },

  saveConfig: async (config) => {
    await invoke('save_config', { config })
    await get().loadConfigs()
  },

  deleteConfig: async (id) => {
    await invoke('delete_config', { id })
    await get().loadConfigs()
  },

  exportConfig: async (id) => {
    return await invoke<string>('export_config', { id })
  },

  importConfig: async (json) => {
    await invoke('import_config', { json })
    await get().loadConfigs()
  },

  connect: async (config) => {
    set({ connecting: true })
    try {
      const status = await invoke<ConnectionStatus>('connect', { config })
      set((s) => {
        const m = new Map(s.activeStatuses)
        m.set(status.id, status)
        return { activeStatuses: m, currentConnectionId: status.id, connecting: false }
      })
      return status
    } catch (e) {
      set({ connecting: false })
      throw e
    }
  },

  disconnect: async (id) => {
    await invoke('disconnect', { id })
    set((s) => {
      const m = new Map(s.activeStatuses)
      m.delete(id)
      const remaining = Array.from(m.keys())
      return {
        activeStatuses: m,
        currentConnectionId: s.currentConnectionId === id ? (remaining[0] ?? null) : s.currentConnectionId,
      }
    })
  },

  testConnection: async (config) => {
    return await invoke<string>('test_connection', { config })
  },

  refreshActiveConnections: async () => {
    try {
      const summaries = await invoke<ConnectionSummary[]>('list_active_connections')
      for (const s of summaries) {
        const status = await invoke<ConnectionStatus>('get_status', { id: s.id })
        set((state) => {
          const m = new Map(state.activeStatuses)
          m.set(s.id, status)
          return { activeStatuses: m }
        })
      }
    } catch (e) {
      console.error('Failed to refresh:', e)
    }
  },

  startStatusListener: async () => {
    const { unlisten } = get()
    if (unlisten) return
    const ul = await listen<ConnectionStatus>('nats-status-update', (event) => {
      const status = event.payload
      set((s) => {
        const m = new Map(s.activeStatuses)
        m.set(status.id, status)
        return {
          activeStatuses: m,
          currentConnectionId: s.currentConnectionId || status.id,
        }
      })
    })
    set({ unlisten: ul })
  },

  stopStatusListener: () => {
    const { unlisten } = get()
    if (unlisten) {
      unlisten()
      set({ unlisten: null })
    }
  },

  switchConnection: (id) => {
    set((s) => {
      if (s.activeStatuses.has(id)) {
        return { currentConnectionId: id }
      }
      return {}
    })
  },
}))
