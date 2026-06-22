/**
 * @file JetStream 管理页面 – 创建/删除流、浏览和清除消息以及管理流级存储配置。
 */

import { useState, useEffect } from 'react'
import { Title, Group, Button, Table, Modal, TextInput, Text, Stack, NumberInput, Badge, ActionIcon, ScrollArea, Tabs } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useTranslation } from 'react-i18next'
import { notifications } from '@mantine/notifications'
import { useNavigate } from 'react-router-dom'
import { IconPlus, IconTrash, IconRefresh, IconEraser, IconEdit, IconPlayerPause, IconPlayerPlay, IconRotateClockwise, IconUsers } from '@tabler/icons-react'
import { invoke } from '@tauri-apps/api/core'
import { useConnectionStore } from '@/stores/connectionStore'

interface StreamInfo { name: string; subjects: string[]; messages: number; consumers: number; first_seq: number; last_seq: number; bytes: number; retention: string; storage: string; max_bytes: number; max_msgs: number; replicas: number }
interface StreamMessage { seq: number; subject: string; payload: string; timestamp: string; size: number }
interface ConsumerInfo { name: string; stream_name: string; paused: boolean; num_pending: number; num_ack_pending: number }

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
  const [loading, setLoading] = useState(false)
  const [createOpen, { open: openCreate, close: closeCreate }] = useDisclosure(false)
  const [browseOpen, { open: openBrowse, close: closeBrowse }] = useDisclosure(false)
  const [editOpen, { open: openEdit, close: closeEdit }] = useDisclosure(false)
  const [consumerOpen, { open: openConsumer, close: closeConsumer }] = useDisclosure(false)
  const [streamMessages, setStreamMessages] = useState<StreamMessage[]>([])
  const [selectedStream, setSelectedStream] = useState('')
  const [msgStartSeq, setMsgStartSeq] = useState<number>(1)
  const [form, setForm] = useState({ name: '', subjects: 'nats.stream.>', max_msgs: -1, max_bytes: -1, replicas: 1 })
  const [editForm, setEditForm] = useState({ max_msgs: -1, max_bytes: -1, max_age: -1, max_msg_size: -1, replicas: 1, description: '' })
  const [editingStream, setEditingStream] = useState('')
  const [consumers, setConsumers] = useState<ConsumerInfo[]>([])
  const [consumerStreamName, setConsumerStreamName] = useState('')
  const [consumersLoading, setConsumersLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<string | null>('streams')
  const [subjectStream, setSubjectStream] = useState('')
  const [subjects, setSubjects] = useState<string[]>([])
  const [subjectsLoading, setSubjectsLoading] = useState(false)
  const [directGetSeq, setDirectGetSeq] = useState<number>(1)
  const [directGetResult, setDirectGetResult] = useState<StreamMessage | null>(null)

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

  async function openEditModal(s: StreamInfo) {
    setEditingStream(s.name)
    setEditForm({ max_msgs: s.max_msgs, max_bytes: s.max_bytes, max_age: -1, max_msg_size: -1, replicas: s.replicas, description: '' })
    openEdit()
  }

  async function updateStream() {
    try {
      await invoke('update_stream', { connectionId: currentId, streamName: editingStream, config: { max_msgs: editForm.max_msgs > 0 ? editForm.max_msgs : null, max_bytes: editForm.max_bytes > 0 ? editForm.max_bytes : null, max_age: editForm.max_age > 0 ? editForm.max_age : null, max_msg_size: editForm.max_msg_size > 0 ? editForm.max_msg_size : null, replicas: editForm.replicas > 0 ? editForm.replicas : null, description: editForm.description || null } })
      notifications.show({ message: t('jetstream.updated'), color: 'green' }); closeEdit(); fetchStreams()
    } catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
  }

  async function directGetMsg() {
    try {
      const result = await invoke<StreamMessage>('direct_get_message', { connectionId: currentId, streamName: selectedStream, seq: directGetSeq })
      setDirectGetResult(result); notifications.show({ message: 'OK', color: 'green' })
    } catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
  }

  async function fetchConsumers(name: string) {
    setConsumerStreamName(name)
    setConsumersLoading(true)
    try { setConsumers(await invoke<ConsumerInfo[]>('list_consumers', { connectionId: currentId, streamName: name })); openConsumer() }
    catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
    finally { setConsumersLoading(false) }
  }

  async function pauseConsumer(consumerName: string) {
    try { await invoke('pause_consumer', { connectionId: currentId, streamName: consumerStreamName, consumerName }); fetchConsumers(consumerStreamName); notifications.show({ message: t('jetstream.paused'), color: 'green' }) }
    catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
  }

  async function resumeConsumer(consumerName: string) {
    try { await invoke('resume_consumer', { connectionId: currentId, streamName: consumerStreamName, consumerName }); fetchConsumers(consumerStreamName); notifications.show({ message: t('jetstream.resumed'), color: 'green' }) }
    catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
  }

  async function resetConsumer(consumerName: string, seq: number) {
    try { await invoke('reset_consumer', { connectionId: currentId, streamName: consumerStreamName, consumerName, seq }); fetchConsumers(consumerStreamName); notifications.show({ message: t('jetstream.resetStream'), color: 'green' }) }
    catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
  }

  async function fetchSubjects(name: string) {
    setSubjectStream(name)
    setSubjectsLoading(true)
    try { setSubjects(await invoke<string[]>('get_stream_subjects', { connectionId: currentId, streamName: name })) }
    catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
    finally { setSubjectsLoading(false) }
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

      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="streams">{t('jetstream.streams')}</Tabs.Tab>
          <Tabs.Tab value="subjects">{t('jetstream.subjects')}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="streams" pt="sm">
          {streams.length > 0 ? (
            <Table striped highlightOnHover withTableBorder style={{ fontSize: 12 }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('jetstream.name')}</Table.Th><Table.Th>{t('jetstream.subjects')}</Table.Th><Table.Th>{t('jetstream.messages')}</Table.Th><Table.Th>{t('jetstream.consumers')}</Table.Th><Table.Th>{t('jetstream.storage')}</Table.Th><Table.Th>{t('jetstream.size')}</Table.Th><Table.Th>{t('jetstream.actions')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {streams.map((s) => (
                  <Table.Tr key={s.name} style={subjectStream === s.name ? { background: 'var(--mantine-color-blue-light)' } : undefined} onClick={() => { setSubjectStream(s.name); setActiveTab('subjects'); fetchSubjects(s.name) }}>
                    <Table.Td fw={500}>{s.name}</Table.Td>
                    <Table.Td ff="monospace" style={{ fontSize: 10 }}>{s.subjects.join(', ')}</Table.Td>
                    <Table.Td>{formatNumber(s.messages)}</Table.Td>
                    <Table.Td>{s.consumers}</Table.Td>
                    <Table.Td><Badge size="xs" color={s.storage.includes('Memory') ? 'orange' : 'blue'}>{s.storage.replace(/\w+::/, '')}</Badge></Table.Td>
                    <Table.Td>{formatBytes(s.bytes)}</Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        <Button size="compact-xs" variant="light" onClick={(e) => { e.stopPropagation(); browseMessages(s.name) }}>{t('jetstream.msgs')}</Button>
                        <ActionIcon variant="subtle" size="sm" onClick={(e) => { e.stopPropagation(); openEditModal(s) }}><IconEdit size={14} /></ActionIcon>
                        <ActionIcon variant="subtle" size="sm" color="cyan" onClick={(e) => { e.stopPropagation(); fetchConsumers(s.name) }}><IconUsers size={14} /></ActionIcon>
                        <ActionIcon variant="subtle" color="orange" size="sm" onClick={(e) => { e.stopPropagation(); purgeStream(s.name) }}><IconEraser size={14} /></ActionIcon>
                        <ActionIcon variant="subtle" color="red" size="sm" onClick={(e) => { e.stopPropagation(); deleteStream(s.name) }}><IconTrash size={14} /></ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : (
            <Text c="dimmed" ta="center" mt={60}>{t('jetstream.noStreams')}</Text>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="subjects" pt="sm">
          {!subjectStream ? (
            <Text c="dimmed" ta="center" mt={60}>{t('jetstream.selectStreamForSubjects')}</Text>
          ) : (
            <Stack gap="xs">
              <Group>
                <Text fw={500}>{subjectStream}</Text>
                <Button size="xs" variant="light" leftSection={<IconRefresh size={14} />} loading={subjectsLoading} onClick={() => fetchSubjects(subjectStream)}>{t('jetstream.refresh')}</Button>
              </Group>
              {subjects.length > 0 ? (
                <Table striped highlightOnHover withTableBorder style={{ fontSize: 12 }}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t('jetstream.subjects')}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {subjects.map((subj) => (
                      <Table.Tr key={subj}>
                        <Table.Td ff="monospace" style={{ fontSize: 12 }}>{subj}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              ) : (
                <Text c="dimmed" ta="center" mt={40}>{t('jetstream.noSubjectsForStream')}</Text>
              )}
            </Stack>
          )}
        </Tabs.Panel>
      </Tabs>

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

      <Modal opened={editOpen} onClose={closeEdit} title={`${t('jetstream.editStream')}: ${editingStream}`} size="md">
        <Stack gap="xs">
          <NumberInput label={t('jetstream.maxMessages')} value={editForm.max_msgs} onChange={(v) => setEditForm({ ...editForm, max_msgs: Number(v) })} />
          <NumberInput label={t('jetstream.maxBytes')} value={editForm.max_bytes} onChange={(v) => setEditForm({ ...editForm, max_bytes: Number(v) })} />
          <NumberInput label={t('jetstream.maxAge')} value={editForm.max_age} onChange={(v) => setEditForm({ ...editForm, max_age: Number(v) })} />
          <NumberInput label={t('jetstream.maxMsgSize')} value={editForm.max_msg_size} onChange={(v) => setEditForm({ ...editForm, max_msg_size: Number(v) })} />
          <NumberInput label={t('jetstream.replicas')} value={editForm.replicas} onChange={(v) => setEditForm({ ...editForm, replicas: Number(v) })} min={1} max={5} />
          <TextInput label={t('jetstream.description')} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
          <Button onClick={updateStream}>{t('jetstream.update')}</Button>
        </Stack>
      </Modal>

      <Modal opened={browseOpen} onClose={() => { closeBrowse(); setDirectGetResult(null) }} title={`${t('jetstream.messageBrowser')}: ${selectedStream}`} size="xl">
        <Group mb="sm">
          <TextInput size="xs" type="number" w={100} placeholder={t('jetstream.startSeq')} value={msgStartSeq.toString()} onChange={(e) => setMsgStartSeq(Number(e.target.value))} />
          <Button size="xs" onClick={() => browseMessages(selectedStream)}>{t('jetstream.load')}</Button>
          <TextInput size="xs" type="number" w={100} placeholder={t('jetstream.sequence')} value={directGetSeq.toString()} onChange={(e) => setDirectGetSeq(Number(e.target.value))} />
          <Button size="xs" onClick={directGetMsg}>{t('jetstream.get')}</Button>
        </Group>
        {directGetResult && (
          <Stack gap={4} mb="sm" p="xs" style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 4, fontSize: 12 }}>
            <Text fw={500}>{t('jetstream.directGetResult')}</Text>
            <Text fw={500}>{t('jetstream.seq')}: {directGetResult.seq}</Text>
            <Text>{t('jetstream.subjects')}: {directGetResult.subject}</Text>
            <Text>{t('jetstream.timestamp')}: {directGetResult.timestamp}</Text>
            <Text style={{ whiteSpace: 'pre-wrap' }}>{directGetResult.payload}</Text>
          </Stack>
        )}
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

      <Modal opened={consumerOpen} onClose={closeConsumer} title={`${t('jetstream.consumersOf')}: ${consumerStreamName}`} size="xl">
        <Group mb="sm">
          <Button size="xs" variant="light" leftSection={<IconRefresh size={14} />} loading={consumersLoading} onClick={() => fetchConsumers(consumerStreamName)}>{t('jetstream.refresh')}</Button>
        </Group>
        {consumers.length > 0 ? (
          <ScrollArea h={400}>
            <Table striped highlightOnHover style={{ fontSize: 11 }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('jetstream.name')}</Table.Th><Table.Th>{t('jetstream.seq')}</Table.Th><Table.Th>Pending</Table.Th><Table.Th>{t('jetstream.actions')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {consumers.map((c) => (
                  <Table.Tr key={c.name}>
                    <Table.Td ff="monospace" style={{ fontSize: 11 }}>{c.name}</Table.Td>
                    <Table.Td><Badge size="xs" color={c.paused ? 'orange' : 'green'}>{c.paused ? 'paused' : 'active'}</Badge></Table.Td>
                    <Table.Td>{c.num_pending}</Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        <ActionIcon variant="subtle" color="orange" size="sm" onClick={() => pauseConsumer(c.name)}><IconPlayerPause size={14} /></ActionIcon>
                        <ActionIcon variant="subtle" color="green" size="sm" onClick={() => resumeConsumer(c.name)}><IconPlayerPlay size={14} /></ActionIcon>
                        <ResetConsumerButton onReset={(seq) => resetConsumer(c.name, seq)} t={t} />
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        ) : (
          <Text c="dimmed" ta="center" mt={40}>{t('jetstream.noConsumers')}</Text>
        )}
      </Modal>
    </div>
  )
}

function ResetConsumerButton({ onReset, t }: { onReset: (seq: number) => void; t: (key: string) => string }) {
  const [seq, setSeq] = useState<number>(0)
  return (
    <Group gap={2}>
      <TextInput size="xs" w={60} type="number" placeholder={t('jetstream.resetSeq')} value={seq.toString()} onChange={(e) => setSeq(Number(e.target.value))} />
      <ActionIcon variant="subtle" size="sm" onClick={() => onReset(seq)}><IconRotateClockwise size={14} /></ActionIcon>
    </Group>
  )
}
