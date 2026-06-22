/**
 * @file JetStream 管理页面 – 创建/删除流、浏览和清除消息以及管理流级存储配置。
 */

import { useState, useEffect } from 'react'
import { Title, Group, Button, Table, Modal, TextInput, Text, Stack, NumberInput, Badge, ActionIcon, ScrollArea } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useTranslation } from 'react-i18next'
import { notifications } from '@mantine/notifications'
import { useNavigate } from 'react-router-dom'
import { IconPlus, IconTrash, IconRefresh, IconEraser } from '@tabler/icons-react'
import { invoke } from '@tauri-apps/api/core'
import { useConnectionStore } from '@/stores/connectionStore'

interface StreamInfo { name: string; subjects: string[]; messages: number; consumers: number; first_seq: number; last_seq: number; bytes: number; retention: string; storage: string; max_bytes: number; max_msgs: number; replicas: number }
interface StreamMessage { seq: number; subject: string; payload: string; timestamp: string; size: number }

/** 将原始字节数转换为人类可读的字符串（B/KB/MB/GB）。 */
function formatBytes(bytes: number) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`; if (bytes < 1073741824) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`; return `${(bytes / 1073741824).toFixed(2)} GB` }
/** 将大数字格式化为带 K/M 后缀的字符串（例如 1500 → "1.5K"）。 */
function formatNumber(n: number) { if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`; if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`; return n.toString() }

export function JetStreamPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const currentId = useConnectionStore((s) => s.currentConnectionId)
  /** 后端返回的当前连接的所有流列表。 */
  const [streams, setStreams] = useState<StreamInfo[]>([])
  /** 流列表获取是否正在进行中。 */
  const [loading, setLoading] = useState(false)
  const [createOpen, { open: openCreate, close: closeCreate }] = useDisclosure(false)
  const [browseOpen, { open: openBrowse, close: closeBrowse }] = useDisclosure(false)
  /** 当前在浏览弹窗中显示的消息列表。 */
  const [streamMessages, setStreamMessages] = useState<StreamMessage[]>([])
  /** 当前正在浏览的流名称。 */
  const [selectedStream, setSelectedStream] = useState('')
  /** 浏览弹窗的起始序列号。 */
  const [msgStartSeq, setMsgStartSeq] = useState<number>(1)
  /** 用于创建新流的表单字段。 */
  const [form, setForm] = useState({ name: '', subjects: 'nats.stream.>', max_msgs: -1, max_bytes: -1, replicas: 1 })

  /** 从后端获取流列表。 */
  async function fetchStreams() {
    if (!currentId) return
    setLoading(true)
    try { setStreams(await invoke<StreamInfo[]>('list_streams', { connectionId: currentId })) }
    catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchStreams() }, [currentId])

  if (!currentId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
        <Title order={3} c="dimmed">{t('topics.noConnection')}</Title>
        <Button onClick={() => navigate('/connections')}>{t('nav.connections')}</Button>
      </div>
    )
  }

  /** 根据表单字段创建一个新的 JetStream 流。 */
  async function createStream() {
    try {
      await invoke('create_stream', { connectionId: currentId, config: { name: form.name, subjects: form.subjects.split(',').map((s: string) => s.trim()), max_msgs: form.max_msgs > 0 ? form.max_msgs : null, max_bytes: form.max_bytes > 0 ? form.max_bytes : null, replicas: form.replicas > 0 ? form.replicas : null, description: null } })
      notifications.show({ message: t('jetstream.createStream'), color: 'green' }); closeCreate(); fetchStreams()
    } catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
  }

  /** 用户确认后删除指定流。 */
  async function deleteStream(name: string) {
    if (!confirm(`${t('jetstream.delete')} "${name}"?`)) return
    try { await invoke('delete_stream', { connectionId: currentId, streamName: name }); fetchStreams() }
    catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
  }

  /** 用户确认后清除指定流中的所有消息。 */
  async function purgeStream(name: string) {
    if (!confirm(`${t('jetstream.purge')} "${name}"?`)) return
    try { await invoke('purge_stream', { connectionId: currentId, streamName: name }); fetchStreams() }
    catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
  }

  /** 从所选流加载一页消息并显示在浏览弹窗中。 */
  async function browseMessages(name: string) {
    setSelectedStream(name)
    try { setStreamMessages(await invoke<StreamMessage[]>('stream_messages', { connectionId: currentId, streamName: name, startSeq: msgStartSeq, limit: 50 })); openBrowse() }
    catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
  }

  /** 按序列号从所选流中删除单条消息。 */
  async function deleteMsg(seq: number) {
    try { await invoke('delete_stream_message', { connectionId: currentId, streamName: selectedStream, seq }); browseMessages(selectedStream) }
    catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
  }

  return (
    <div style={{ padding: 16 }}>
      <Group justify="space-between" mb="md">
        <Title order={3}>{t('jetstream.title')}</Title>
        <Group>
          <Button size="xs" variant="light" leftSection={<IconRefresh size={14} />} loading={loading} onClick={fetchStreams}>{t('jetstream.refresh')}</Button>
          <Button size="xs" leftSection={<IconPlus size={14} />} onClick={openCreate}>{t('jetstream.newStream')}</Button>
        </Group>
      </Group>

      {streams.length > 0 ? (
        <Table striped highlightOnHover withTableBorder style={{ fontSize: 12 }}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('jetstream.name')}</Table.Th><Table.Th>{t('jetstream.subjects')}</Table.Th><Table.Th>{t('jetstream.messages')}</Table.Th><Table.Th>{t('jetstream.consumers')}</Table.Th><Table.Th>{t('jetstream.storage')}</Table.Th><Table.Th>{t('jetstream.size')}</Table.Th><Table.Th>{t('jetstream.actions')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {streams.map((s) => (
              <Table.Tr key={s.name}>
                <Table.Td fw={500}>{s.name}</Table.Td>
                <Table.Td ff="monospace" style={{ fontSize: 10 }}>{s.subjects.join(', ')}</Table.Td>
                <Table.Td>{formatNumber(s.messages)}</Table.Td>
                <Table.Td>{s.consumers}</Table.Td>
                <Table.Td><Badge size="xs" color={s.storage.includes('Memory') ? 'orange' : 'blue'}>{s.storage.replace(/\w+::/, '')}</Badge></Table.Td>
                <Table.Td>{formatBytes(s.bytes)}</Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    <Button size="compact-xs" variant="light" onClick={() => browseMessages(s.name)}>{t('jetstream.msgs')}</Button>
                    <ActionIcon variant="subtle" color="orange" size="sm" onClick={() => purgeStream(s.name)}><IconEraser size={14} /></ActionIcon>
                    <ActionIcon variant="subtle" color="red" size="sm" onClick={() => deleteStream(s.name)}><IconTrash size={14} /></ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      ) : (
        <Text c="dimmed" ta="center" mt={60}>{t('jetstream.noStreams')}</Text>
      )}

      <Modal opened={createOpen} onClose={closeCreate} title={t('jetstream.createStream')} size="md">
        <Stack gap="xs">
          <TextInput label={t('jetstream.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="MY_STREAM" required />
          <TextInput label={t('jetstream.subjects')} value={form.subjects} onChange={(e) => setForm({ ...form, subjects: e.target.value })} placeholder="orders.>" />
          <NumberInput label={t('jetstream.maxMessages')} value={form.max_msgs} onChange={(v) => setForm({ ...form, max_msgs: Number(v) })} />
          <NumberInput label={t('jetstream.maxBytes')} value={form.max_bytes} onChange={(v) => setForm({ ...form, max_bytes: Number(v) })} />
          <NumberInput label={t('jetstream.replicas')} value={form.replicas} onChange={(v) => setForm({ ...form, replicas: Number(v) })} min={1} max={5} />
          <Button onClick={createStream}>{t('jetstream.create')}</Button>
        </Stack>
      </Modal>

      <Modal opened={browseOpen} onClose={closeBrowse} title={`${t('jetstream.messageBrowser')}: ${selectedStream}`} size="xl">
        <Group mb="sm">
          <TextInput size="xs" type="number" w={100} placeholder={t('jetstream.startSeq')} value={msgStartSeq.toString()} onChange={(e) => setMsgStartSeq(Number(e.target.value))} />
          <Button size="xs" onClick={() => browseMessages(selectedStream)}>{t('jetstream.load')}</Button>
        </Group>
        <ScrollArea h={400}>
          <Table striped highlightOnHover style={{ fontSize: 11 }}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('jetstream.seq')}</Table.Th><Table.Th>{t('jetstream.subjects')}</Table.Th><Table.Th>{t('jetstream.timestamp')}</Table.Th><Table.Th>{t('jetstream.payload')}</Table.Th><Table.Th>{t('jetstream.size')}</Table.Th><Table.Th></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {streamMessages.map((m) => (
                <Table.Tr key={m.seq}>
                  <Table.Td>{m.seq}</Table.Td>
                  <Table.Td ff="monospace" style={{ fontSize: 10 }}>{m.subject}</Table.Td>
                  <Table.Td style={{ fontSize: 10 }}>{m.timestamp}</Table.Td>
                  <Table.Td ff="monospace" style={{ fontSize: 10 }}>{m.payload.length > 80 ? m.payload.slice(0, 80) + '...' : m.payload}</Table.Td>
                  <Table.Td>{m.size}</Table.Td>
                  <Table.Td><ActionIcon variant="subtle" color="red" size="xs" onClick={() => deleteMsg(m.seq)}><IconTrash size={12} /></ActionIcon></Table.Td>
                </Table.Tr>
              ))}
              {streamMessages.length === 0 && <Table.Tr><Table.Td colSpan={6} ta="center" c="dimmed">{t('topics.noSubjects')}</Table.Td></Table.Tr>}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Modal>
    </div>
  )
}
