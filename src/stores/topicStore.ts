/**
 * @file 管理 NATS 主题订阅和主题发现的 Zustand store。
 * 封装了 Tauri 命令 subscribe、unsubscribe 和 discover_subjects。
 */

import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { SubscriptionInfo } from '@/types'

/** 管理活跃订阅列表和主题发现结果。 */
interface TopicState {
  subscriptions: SubscriptionInfo[]
  discoveredSubjects: string[]
  discovering: boolean

  subscribe: (connectionId: string, subject: string) => Promise<SubscriptionInfo>
  unsubscribe: (subscriptionId: string, connectionId: string) => Promise<void>
  discoverSubjects: (connectionId: string, durationMs?: number) => Promise<string[]>
}

export const useTopicStore = create<TopicState>((set, get) => ({
  subscriptions: [],
  discoveredSubjects: [],
  discovering: false,

  subscribe: async (connectionId, subject) => {
    const sub = await invoke<SubscriptionInfo>('subscribe', {
      req: { connection_id: connectionId, subject },
    })
    set((s) => ({ subscriptions: [...s.subscriptions, sub] }))
    return sub
  },

  unsubscribe: async (subscriptionId, connectionId) => {
    await invoke('unsubscribe', {
      req: { connection_id: connectionId, subscription_id: subscriptionId },
    })
    set((s) => ({
      subscriptions: s.subscriptions.filter((x) => x.id !== subscriptionId),
    }))
  },

  discoverSubjects: async (connectionId, durationMs) => {
    set({ discovering: true })
    try {
      const subjects = await invoke<string[]>('discover_subjects', {
        connectionId,
        durationMs: durationMs ?? 2000,
      })
      set({ discoveredSubjects: subjects, discovering: false })
      return subjects
    } catch (e) {
      set({ discovering: false })
      throw e
    }
  },
}))
