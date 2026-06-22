/**
 * @file 通过 Tauri 事件桥接缓冲接收到的 NATS 消息的 Zustand store。
 * 维护一个带上限的环形缓冲区（默认 10000 条消息），并提供按订阅过滤的视图。
 */

import { create } from 'zustand'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { NatsMessageEvent } from '@/types'
import { logger } from '@/utils/logger'

/** 内存缓冲区中保留的最大消息数。 */
const MAX_MESSAGES = 10000

/** 累积解码后的 NATS 消息，并提供按订阅过滤的功能。 */
interface MessageState {
  messages: NatsMessageEvent[]
  unlisten: UnlistenFn | null

  startListener: () => Promise<void>
  stopListener: () => void
  clearMessages: () => void
  getForSubscription: (id: string) => NatsMessageEvent[]
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: [],
  unlisten: null,

  startListener: async () => {
    if (get().unlisten) return
    const ul = await listen<NatsMessageEvent>('nats-message', (event) => {
      set((s) => {
        const msgs = [...s.messages, event.payload]
        if (msgs.length > MAX_MESSAGES) {
          msgs.splice(0, msgs.length - MAX_MESSAGES)
        }
        return { messages: msgs }
      })
    })
    logger.info('Message listener started')
    set({ unlisten: ul })
  },

  stopListener: () => {
    const { unlisten } = get()
    if (unlisten) {
      unlisten()
      logger.info('Message listener stopped')
      set({ unlisten: null })
    }
  },

  clearMessages: () => {
    logger.info('Messages cleared')
    set({ messages: [] })
  },

  getForSubscription: (id) => {
    return get().messages.filter((m) => m.subscription_id === id)
  },
}))
