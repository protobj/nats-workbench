/**
 * @file 消息页面 – 订阅 NATS 主题、发布消息以及发送请求-回复（RPC）调用。包含支持清空的实时消息表格。
 */

import { useState, useEffect } from 'react'
import { Title, Group, Button, Tabs, Stack, NumberInput, Badge, Switch, Text, TextInput } from '@mantine/core'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { notifications } from '@mantine/notifications'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import { invoke } from '@tauri-apps/api/core'
import { useConnectionStore } from '@/stores/connectionStore'
import { useTopicStore } from '@/stores/topicStore'
import { useMessageStore } from '@/stores/messageStore'
import { MessageTable } from '@/components/common/MessageTable'
import { TopicInput } from '@/components/common/TopicInput'
import { PayloadEditor } from '@/components/common/PayloadEditor'

export function MessagesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const currentId = useConnectionStore((s) => s.currentConnectionId)
  const messages = useMessageStore((s) => s.messages)
  const clearMessages = useMessageStore((s) => s.clearMessages)
  const subscriptions = useTopicStore((s) => s.subscriptions)
  const subscribe = useTopicStore((s) => s.subscribe)
  const unsubscribe = useTopicStore((s) => s.unsubscribe)

  /** 要订阅的主题模式（例如 ">" 或特定主题）。 */
  const [subSubject, setSubSubject] = useState(params.get('subject') || '>')
  /** 订阅操作是否正在进行中。 */
  const [subscribing, setSubscribing] = useState(false)
  /** 消息表格的自动滚动开关（当前始终为 true）。 */
  const [autoScroll] = useState(true)
  /** 当前操作标签页：监听、发布或 RPC。 */
  const [activeTab, setActiveTab] = useState<string | null>('listen')

  /** 发布消息的目标主题。 */
  const [pubSubject, setPubSubject] = useState('')
  /** 发布的 reply-to 主题（可选）。 */
  const [pubReply, setPubReply] = useState('')
  /** 要发布的消息负载体。 */
  const [pubPayload, setPubPayload] = useState('{}')
  /** 发布操作是否正在进行中。 */
  const [publishing, setPublishing] = useState(false)

  /** RPC 调用的请求-回复主题。 */
  const [rpcSubject, setRpcSubject] = useState('')
  /** RPC 超时时间，单位为毫秒。 */
  const [rpcTimeout, setRpcTimeout] = useState<number | string>(5000)
  /** RPC 请求的负载。 */
  const [rpcPayload, setRpcPayload] = useState('{}')
  /** RPC 调用是否正在进行中。 */
  const [rpcLoading, setRpcLoading] = useState(false)
  /** 从 RPC 调用接收到的原始响应。 */
  const [rpcResponse, setRpcResponse] = useState<string | null>(null)

  useEffect(() => { const s = params.get('subject'); if (s) setSubSubject(s) }, [params])

  if (!currentId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
        <Title order={3} c="dimmed">{t('messages.noConnection')}</Title>
        <Button onClick={() => navigate('/connections')}>{t('nav.connections')}</Button>
      </div>
    )
  }

  /** 在活跃连接上订阅已配置的主题。 */
  async function handleSubscribe() {
    if (!subSubject.trim()) return
    setSubscribing(true)
    try { await subscribe(currentId!, subSubject.trim()); notifications.show({ message: `${t('messages.subscribe')} ${subSubject}`, color: 'green' }) }
    catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
    finally { setSubscribing(false) }
  }

  /** 从活跃连接取消订阅指定的订阅。 */
  async function handleUnsubscribe(id: string) {
    try { await unsubscribe(id, currentId!) } catch {}
  }

  /** 向目标主题发布一条消息，可附带 reply-to 主题。 */
  async function handlePublish() {
    if (!pubSubject.trim()) return
    setPublishing(true)
    try {
      await invoke('publish', { req: { connection_id: currentId!, subject: pubSubject.trim(), reply_to: pubReply.trim() || null, payload: pubPayload, headers: null } })
      notifications.show({ message: t('messages.published'), color: 'green' })
    } catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
    finally { setPublishing(false) }
  }

  /** 发送请求-回复（RPC）调用并显示响应。 */
  async function handleRpc() {
    if (!rpcSubject.trim()) return
    setRpcLoading(true); setRpcResponse(null)
    try {
      const result = await invoke<string>('send_request', { req: { connection_id: currentId!, subject: rpcSubject.trim(), payload: rpcPayload, timeout_ms: typeof rpcTimeout === 'number' ? rpcTimeout : 5000 } })
      setRpcResponse(result)
    } catch (e: any) { setRpcResponse(`${t('common.error')}: ${e}`) } finally { setRpcLoading(false) }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--mantine-color-dark-4)', flexShrink: 0 }}>
        <Group gap="xs" mb={4}>
          <TopicInput value={subSubject} onChange={setSubSubject} placeholder={t('messages.subscribeTo')} />
          <Button size="compact-sm" leftSection={<IconPlus size={14} />} onClick={handleSubscribe} loading={subscribing}>{t('messages.subscribe')}</Button>
          <Tabs value={activeTab} onChange={setActiveTab} variant="pills" style={{ flex: 1 }}>
            <Tabs.List>
              <Tabs.Tab value="listen">{t('messages.listen')}</Tabs.Tab>
              <Tabs.Tab value="publish">{t('messages.publish')}</Tabs.Tab>
              <Tabs.Tab value="rpc">{t('messages.rpc')}</Tabs.Tab>
            </Tabs.List>
          </Tabs>
          <Switch size="xs" label={t('messages.auto')} checked={autoScroll} />
          <Button size="compact-sm" variant="light" onClick={clearMessages}>{t('messages.clear')}</Button>
          <Badge size="sm" variant="light">{messages.length} {t('messages.msgs')}</Badge>
        </Group>
        {subscriptions.length > 0 && (
          <Group gap={4}>
            {subscriptions.map((s) => (
              <Badge key={s.id} size="sm" variant="light" rightSection={<IconTrash size={11} style={{ cursor: 'pointer' }} onClick={() => handleUnsubscribe(s.id)} />}>{s.subject}</Badge>
            ))}
          </Group>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === 'listen' && <MessageTable messages={messages} />}
        {activeTab === 'publish' && (
          <div style={{ maxWidth: 600, margin: '16px auto' }}>
            <Stack gap="xs">
              <TopicInput value={pubSubject} onChange={setPubSubject} placeholder={t('messages.targetSubject')} />
              <TextInput size="xs" value={pubReply} onChange={(e) => setPubReply(e.target.value)} placeholder={t('messages.replyOptional')} />
              <PayloadEditor value={pubPayload} onChange={setPubPayload} />
              <Button onClick={handlePublish} loading={publishing}>{t('messages.publishButton')}</Button>
            </Stack>
          </div>
        )}
        {activeTab === 'rpc' && (
          <div style={{ maxWidth: 600, margin: '16px auto' }}>
            <Stack gap="xs">
              <TopicInput value={rpcSubject} onChange={setRpcSubject} placeholder={t('messages.requestSubject')} />
              <NumberInput size="xs" label={t('messages.timeout')} value={rpcTimeout} onChange={setRpcTimeout} min={100} max={60000} />
              <PayloadEditor value={rpcPayload} onChange={setRpcPayload} placeholder={t('messages.enterPayload')} />
              <Button onClick={handleRpc} loading={rpcLoading}>{t('messages.sendRequest')}</Button>
              {rpcResponse !== null && (
                <div>
                  <Text size="xs" c="dimmed" mb={4}>{t('messages.response')}:</Text>
                  <pre style={{ background: 'var(--mantine-color-dark-6)', padding: 8, borderRadius: 4, fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {(() => { try { return JSON.stringify(JSON.parse(rpcResponse), null, 2) } catch { return rpcResponse } })()}
                  </pre>
                </div>
              )}
            </Stack>
          </div>
        )}
      </div>
    </div>
  )
}
