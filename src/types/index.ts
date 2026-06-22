/**
 * @file NATS GUI 前端的共享类型定义、认证可辨识联合类型与工具辅助函数。
 * 所有 Tauri 命令的载荷均使用这些类型。
 */

/** 持久化的 NATS 连接配置（服务器、认证、选项）。 */
export interface ConnectionConfig {
  id: string
  label: string
  servers: string[]
  auth: AuthMethod
  options: ConnectionOptions
}

/** 支持的 NATS 认证方法的可辨识联合类型。 */
export type AuthMethod =
  | { type: 'none' }
  | { type: 'token'; token: string }
  | { type: 'user_password'; username: string; password: string }
  | { type: 'nkey'; nkey_seed: string }
  | { type: 'jwt'; jwt: string; nkey_seed: string }
  | { type: 'tls'; ca_cert_path: string | null; client_cert_path: string; client_key_path: string }

/** 连接时转发给 NATS 客户端的微调选项。 */
export interface ConnectionOptions {
  max_reconnects: number | null
  reconnect_delay_ms: number | null
  connection_timeout_ms: number | null
  name: string | null
  inbox_prefix: string | null
  retry_on_failed_connect: boolean
  echo: boolean
  verbose: boolean
}

/** 活跃 NATS 连接的实时遥测快照。 */
export interface ConnectionStatus {
  id: string
  label: string
  state: string
  rtt_ms: number
  server_addr: string
  server_version: string
  msgs_in_per_sec: number
  msgs_out_per_sec: number
  bytes_in_per_sec: number
  bytes_out_per_sec: number
  reconnect_count: number
  uptime_secs: number
  subscriptions_count: number
}

/** list_active_connections 返回的轻量摘要。 */
export interface ConnectionSummary {
  id: string
  label: string
  state: string
  server_addr: string
  connected_at: string | null
}

/** 表示 NATS 主题上的活跃订阅。 */
export interface SubscriptionInfo {
  id: string
  subject: string
  connection_id: string
}

/** 通过 Tauri 事件桥接传递的 NATS 消息。 */
export interface NatsMessageEvent {
  connection_id: string
  subscription_id: string
  subject: string
  reply: string | null
  payload: string
  payload_bytes: string
  timestamp: number
  size: number
}

/** 生成 UUID v4 字符串；当 crypto 不可用时回退到 Math.random。 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** 为新配置返回合理的默认 ConnectionOptions 值。 */
export function defaultConnectionOptions(): ConnectionOptions {
  return {
    max_reconnects: 10,
    reconnect_delay_ms: 1000,
    connection_timeout_ms: 5000,
    name: null,
    inbox_prefix: null,
    retry_on_failed_connect: true,
    echo: true,
    verbose: false,
  }
}

/** 构建一个预填本地 localhost 默认值的空白 ConnectionConfig。 */
export function emptyConfig(): ConnectionConfig {
  return {
    id: generateId(),
    label: '',
    servers: ['nats://localhost:4222'],
    auth: { type: 'none' },
    options: defaultConnectionOptions(),
  }
}
