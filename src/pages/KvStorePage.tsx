/**
 * @file KV 存储页面 – 浏览、创建、编辑、删除 NATS Key-Value 存储桶中的键。支持实时监听键变更和 CRUD 操作。
 */

import { useState, useEffect, useCallback } from 'react'
import { Title, Group, Button, Table, Modal, TextInput, Text, Stack, Card, Badge, ActionIcon, Tabs, Paper, Code } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useTranslation } from 'react-i18next'
import { notifications } from '@mantine/notifications'
import { useNavigate } from 'react-router-dom'
import { IconRefresh, IconPlus, IconTrash, IconEdit } from '@tabler/icons-react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useConnectionStore } from '@/stores/connectionStore'

interface KvStoreInfo { name: string; values: number; bytes: number }
interface KvEntry { key: string; value: string; revision: number; created: string; operation: string }
interface KvUpdateEvent { key: string; value: string; operation: string; revision: number }

/** 将原始字节数转换为人类可读的字符串（B/KB/MB）。 */
function formatBytes(bytes: number) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / (1024 * 1024)).toFixed(1)} MB` }

export function KvStorePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const currentId = useConnectionStore((s) => s.currentConnectionId)
  /** 服务器上的 KV 存储桶列表。 */
  const [stores, setStores] = useState<KvStoreInfo[]>([])
  /** 当前选中的用于浏览的存储桶。 */
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null)
  /** 选中存储桶中的键值条目。 */
  const [entries, setEntries] = useState<KvEntry[]>([])
  /** 存储/条目获取是否正在进行中。 */
  const [loading, setLoading] = useState(false)
  const [editOpen, { open: openEdit, close: closeEdit }] = useDisclosure(false)
  /** 编辑/新建弹窗中正在编辑的键名。 */
  const [editingKey, setEditingKey] = useState('')
  /** 编辑/新建弹窗中正在编辑的值。 */
  const [editingValue, setEditingValue] = useState('')
  /** 弹窗是否用于新建键（与编辑已有键相反）。 */
  const [isNew, setIsNew] = useState(false)
  /** 新建存储桶名称输入。 */
  const [newBucketName, setNewBucketName] = useState('')
  /** KV 监听流中的日志行。 */
  const [watchLog, setWatchLog] = useState<string[]>([])
  let watchUnlisten: UnlistenFn | null = null

  /** 从当前连接获取 KV 存储列表。 */
  async function fetchStores() {
    if (!currentId) return
    setLoading(true)
    try { setStores(await invoke<KvStoreInfo[]>('list_kv_stores', { connectionId: currentId })) }
    catch { /* */ } finally { setLoading(false) }
  }

  useEffect(() => { fetchStores() }, [currentId])

  /** 获取给定存储桶的所有键值条目。 */
  const fetchEntries = useCallback(async (bucket: string) => {
    setSelectedBucket(bucket)
    try { setEntries(await invoke<KvEntry[]>('kv_get_keys', { connectionId: currentId, bucket })) }
    catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
  }, [currentId])

  async function handleGet(bucket: string) { setSelectedBucket(bucket); await fetchEntries(bucket) }

  /** 打开编辑弹窗，预填为新建键。 */
  function handleNew() { setEditingKey(''); setEditingValue(''); setIsNew(true); openEdit() }

  /** 打开编辑弹窗，预填已有条目的数据。 */
  function handleEdit(e: KvEntry) { setEditingKey(e.key); setEditingValue(e.value); setIsNew(false); openEdit() }

  /** 将键值对持久化到选中的存储桶。 */
  async function handleSave() {
    if (!selectedBucket) return
    try {
      await invoke('kv_put', { req: { connection_id: currentId, bucket: selectedBucket, key: editingKey, value: editingValue } })
      notifications.show({ message: t('common.success'), color: 'green' }); closeEdit()
      if (selectedBucket) fetchEntries(selectedBucket)
    } catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
  }

  /** 用户确认后从选中存储桶中删除一个键。 */
  async function handleDelete(key: string) {
    if (!selectedBucket || !confirm(`${t('connections.delete')} "${key}"?`)) return
    try {
      await invoke('kv_delete', { connectionId: currentId, bucket: selectedBucket, key })
      fetchEntries(selectedBucket)
    } catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
  }

  /** 使用给定名称创建一个新的 KV 存储桶。 */
  async function handleCreateBucket() {
    if (!newBucketName.trim()) return
    try {
      await invoke('create_kv_store', { connectionId: currentId, bucket: newBucketName.trim(), description: null })
      notifications.show({ message: t('common.success'), color: 'green' })
      setNewBucketName('')
      fetchStores()
    } catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
  }

  /** 用户确认后删除整个 KV 存储桶。 */
  async function handleDeleteBucket(bucket: string) {
    if (!confirm(`${t('kv.deleteStore')} "${bucket}"?`)) return
    try {
      await invoke('delete_kv_store', { connectionId: currentId, bucket })
      if (selectedBucket === bucket) { setSelectedBucket(null); setEntries([]) }
      fetchStores()
    } catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
  }

  /** 开始监听指定存储桶的实时更新，并记录事件日志。 */
  async function handleWatch(bucket: string) {
    try {
      await invoke('kv_watch', { connectionId: currentId, bucket, keyFilter: null })
      setWatchLog([t('kv.watching', { bucket })])
      if (watchUnlisten) watchUnlisten()
      watchUnlisten = await listen<KvUpdateEvent>('kv-update', (e) => {
        const ev = e.payload
        setWatchLog((prev) => [...prev.slice(-99), `[${ev.operation.toUpperCase()}] ${ev.key} = ${ev.value.slice(0, 100)}`])
        if (bucket === selectedBucket) fetchEntries(bucket)
      })
    } catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
  }

  if (!currentId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
        <Title order={3} c="dimmed">{t('topics.noConnection')}</Title>
        <Button onClick={() => navigate('/connections')}>{t('nav.connections')}</Button>
      </div>
    )
  }

  return (
    <div style={{ padding: 16, height: '100%', display: 'flex', gap: 16 }}>
      <div style={{ width: 260, flexShrink: 0 }}>
        <Group justify="space-between" mb="xs">
          <Title order={4}>{t('kv.stores')}</Title>
          <Button size="compact-xs" variant="light" onClick={fetchStores} loading={loading}><IconRefresh size={14} /></Button>
        </Group>
        <Group gap="xs" mb="xs">
          <TextInput
            size="xs"
            placeholder={t('kv.createStore')}
            value={newBucketName}
            onChange={(e) => setNewBucketName(e.target.value)}
            style={{ flex: 1 }}
          />
          <Button size="compact-xs" onClick={handleCreateBucket}>{t('kv.create')}</Button>
        </Group>
        <Stack gap={4}>
          {stores.map((s) => (
            <Card key={s.name} withBorder padding="xs" style={{ cursor: 'pointer', background: selectedBucket === s.name ? 'var(--mantine-color-blue-9)' : undefined }} onClick={() => handleGet(s.name)}>
              <Group justify="space-between">
                <Text size="sm" fw={500}>{s.name}</Text>
                <Group gap={4}>
                  <Badge size="xs">{s.values} {t('kv.vals')}</Badge>
                  <ActionIcon variant="subtle" color="red" size="xs" onClick={(e) => { e.stopPropagation(); handleDeleteBucket(s.name) }}><IconTrash size={12} /></ActionIcon>
                </Group>
              </Group>
              <Text size="xs" c="dimmed">{formatBytes(s.bytes)}</Text>
            </Card>
          ))}
          {stores.length === 0 && <Text size="xs" c="dimmed" ta="center">{t('kv.noStores')}</Text>}
        </Stack>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {selectedBucket ? (
          <>
            <Tabs defaultValue="browse">
              <Tabs.List>
                <Tabs.Tab value="browse">{t('kv.browse')}</Tabs.Tab>
                <Tabs.Tab value="watch">{t('kv.watch')}</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="browse" pt="xs">
                <Group justify="space-between" mb="xs">
                  <Title order={4}>{selectedBucket}</Title>
                  <Group gap="xs">
                    <Button size="xs" leftSection={<IconPlus size={12} />} onClick={handleNew}>{t('kv.newKey')}</Button>
                    <Button size="xs" variant="light" onClick={() => handleWatch(selectedBucket)}>{t('kv.watch')}</Button>
                  </Group>
                </Group>
                <Table striped highlightOnHover style={{ fontSize: 12 }}>
                  <Table.Thead><Table.Tr><Table.Th>{t('kv.key')}</Table.Th><Table.Th>{t('kv.value')}</Table.Th><Table.Th w={80}>{t('kv.actions')}</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {entries.map((e) => (
                      <Table.Tr key={e.key}>
                        <Table.Td ff="monospace" style={{ fontSize: 10 }}>{e.key}</Table.Td>
                        <Table.Td ff="monospace" style={{ fontSize: 10 }}>{e.value.length > 60 ? e.value.slice(0, 60) + '...' : e.value}</Table.Td>
                        <Table.Td>
                          <Group gap={4}>
                            <ActionIcon variant="subtle" size="xs" onClick={() => handleEdit(e)}><IconEdit size={12} /></ActionIcon>
                            <ActionIcon variant="subtle" color="red" size="xs" onClick={() => handleDelete(e.key)}><IconTrash size={12} /></ActionIcon>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                    {entries.length === 0 && <Table.Tr><Table.Td colSpan={3} ta="center" c="dimmed">{t('kv.noEntries')}</Table.Td></Table.Tr>}
                  </Table.Tbody>
                </Table>
              </Tabs.Panel>

              <Tabs.Panel value="watch" pt="xs">
                <Paper withBorder p="xs" h={400} style={{ overflow: 'auto', background: 'var(--mantine-color-dark-7)' }}>
                  {watchLog.map((l, i) => (<Text key={i} size="xs" ff="monospace" style={{ fontSize: 10 }}>{l}</Text>))}
                  {watchLog.length === 0 && <Text size="xs" c="dimmed">{t('kv.noEvents')}</Text>}
                </Paper>
              </Tabs.Panel>
            </Tabs>
          </>
        ) : (
          <Text c="dimmed" ta="center" style={{ marginTop: 'auto', marginBottom: 'auto' }}>{t('kv.selectStore')}</Text>
        )}
      </div>

      <Modal opened={editOpen} onClose={closeEdit} title={isNew ? t('kv.newKey') : t('kv.editKey')} size="lg">
        <Stack gap="xs">
          <TextInput label={t('kv.key')} value={editingKey} onChange={(e) => setEditingKey(e.target.value)} disabled={!isNew} placeholder="config.key" required />
          <Code block style={{ fontFamily: 'monospace', fontSize: 12, minHeight: 120 }}>
            <textarea value={editingValue} onChange={(e) => setEditingValue(e.target.value)} style={{ width: '100%', minHeight: 120, background: 'transparent', border: 'none', color: 'inherit', fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} />
          </Code>
          <Button onClick={handleSave}>{t('common.save')}</Button>
        </Stack>
      </Modal>
    </div>
  )
}
