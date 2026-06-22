/**
 * @file 对象存储页面 – 管理 NATS 对象存储桶：创建、列出、上传、查看、下载和删除对象。
 */

import { useState, useEffect, useCallback } from 'react'
import { Title, Group, Button, Table, Modal, TextInput, Text, Stack, Card, Badge, ActionIcon, Textarea } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useTranslation } from 'react-i18next'
import { notifications } from '@mantine/notifications'
import { useNavigate } from 'react-router-dom'
import { IconRefresh, IconPlus, IconTrash, IconDownload, IconEye } from '@tabler/icons-react'
import { invoke } from '@tauri-apps/api/core'
import { useConnectionStore } from '@/stores/connectionStore'

interface ObjStoreInfo { name: string; count: number; bytes: number }
interface ObjInfo { name: string; bucket: string; size: number; chunks: number; description: string | null; modified: string; deleted: boolean }

/** 将原始字节数转换为人类可读的字符串（B/KB/MB/GB）。 */
function formatBytes(bytes: number) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`; if (bytes < 1073741824) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`; return `${(bytes / 1073741824).toFixed(2)} GB` }

export function ObjectStorePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const currentId = useConnectionStore((s) => s.currentConnectionId)
  /** 服务器上的对象存储桶列表。 */
  const [stores, setStores] = useState<ObjStoreInfo[]>([])
  /** 当前选中的用于列出对象的存储桶。 */
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null)
  /** 选中存储桶的对象元数据。 */
  const [objects, setObjects] = useState<ObjInfo[]>([])
  /** 存储列表获取是否正在进行中。 */
  const [loading, setLoading] = useState(false)
  const [putOpen, { open: openPut, close: closePut }] = useDisclosure(false)
  const [viewOpen, { open: openView, close: closeView }] = useDisclosure(false)
  /** 上传表单中的对象名称。 */
  const [putName, setPutName] = useState('')
  /** 上传表单中的对象数据/内容。 */
  const [putData, setPutData] = useState('')
  /** 查看对象弹窗中显示的内容。 */
  const [viewData, setViewData] = useState('')
  /** 新建存储桶名称输入。 */
  const [newBucketName, setNewBucketName] = useState('')

  /** 获取对象存储桶列表。 */
  async function fetchStores() {
    if (!currentId) return
    setLoading(true)
    try { setStores(await invoke<ObjStoreInfo[]>('list_object_stores', { connectionId: currentId })) }
    catch { /* */ } finally { setLoading(false) }
  }

  useEffect(() => { fetchStores() }, [currentId])

  /** 获取给定存储桶的对象列表。 */
  const fetchObjects = useCallback(async (bucket: string) => {
    setSelectedBucket(bucket)
    try { setObjects(await invoke<ObjInfo[]>('list_objects', { connectionId: currentId, bucket })) }
    catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
  }, [currentId])

  /** 上传一个对象（名称 + 数据）到选中的存储桶。 */
  async function handlePut() {
    if (!selectedBucket || !putName.trim()) return
    try {
      await invoke('obj_put', { req: { connection_id: currentId, bucket: selectedBucket, name: putName.trim(), data: putData, description: null } })
      notifications.show({ message: t('common.success'), color: 'green' }); closePut()
      if (selectedBucket) fetchObjects(selectedBucket)
    } catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
  }

  /** 用户确认后从选中存储桶中删除一个对象。 */
  async function handleDelete(name: string) {
    if (!selectedBucket || !confirm(`${t('common.delete')} "${name}"?`)) return
    try {
      await invoke('obj_delete', { connectionId: currentId, bucket: selectedBucket, name })
      fetchObjects(selectedBucket)
    } catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
  }

  /** 获取对象内容并在只读弹窗中显示。 */
  async function handleView(name: string) {
    try {
      const data = await invoke<string>('obj_get', { connectionId: currentId, bucket: selectedBucket, name })
      setViewData(data); openView()
    } catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
  }

  /** 通过浏览器将对象下载为文件。 */
  async function handleDownload(name: string) {
    try {
      const data = await invoke<string>('obj_get', { connectionId: currentId, bucket: selectedBucket, name })
      const blob = new Blob([data], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = name; a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
  }

  /** 使用给定名称创建一个新的对象存储桶。 */
  async function handleCreateBucket() {
    if (!newBucketName.trim()) return
    try {
      await invoke('create_object_store', { connectionId: currentId, bucket: newBucketName.trim(), description: null })
      notifications.show({ message: t('common.success'), color: 'green' })
      setNewBucketName('')
      fetchStores()
    } catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
  }

  /** 用户确认后删除整个对象存储桶。 */
  async function handleDeleteBucket(bucket: string) {
    if (!confirm(`${t('objectStore.deleteStore')} "${bucket}"?`)) return
    try {
      await invoke('delete_object_store', { connectionId: currentId, bucket })
      if (selectedBucket === bucket) { setSelectedBucket(null); setObjects([]) }
      fetchStores()
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
          <Title order={4}>{t('objectStore.stores')}</Title>
          <Button size="compact-xs" variant="light" onClick={fetchStores} loading={loading}><IconRefresh size={14} /></Button>
        </Group>
        <Group gap="xs" mb="xs">
          <TextInput
            size="xs"
            placeholder={t('objectStore.createStore')}
            value={newBucketName}
            onChange={(e) => setNewBucketName(e.target.value)}
            style={{ flex: 1 }}
          />
          <Button size="compact-xs" onClick={handleCreateBucket}>{t('objectStore.create')}</Button>
        </Group>
        <Stack gap={4}>
          {stores.map((s) => (
            <Card key={s.name} withBorder padding="xs" style={{ cursor: 'pointer', background: selectedBucket === s.name ? 'var(--mantine-color-blue-9)' : undefined }} onClick={() => fetchObjects(s.name)}>
              <Group justify="space-between">
                <Text size="sm" fw={500}>{s.name}</Text>
                <Group gap={4}>
                  <Badge size="xs">{s.count}</Badge>
                  <ActionIcon variant="subtle" color="red" size="xs" onClick={(e) => { e.stopPropagation(); handleDeleteBucket(s.name) }}><IconTrash size={12} /></ActionIcon>
                </Group>
              </Group>
              <Text size="xs" c="dimmed">{formatBytes(s.bytes)}</Text>
            </Card>
          ))}
          {stores.length === 0 && <Text size="xs" c="dimmed" ta="center">{t('objectStore.noStores')}</Text>}
        </Stack>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {selectedBucket ? (
          <>
            <Group justify="space-between" mb="xs">
              <Title order={4}>{selectedBucket}</Title>
              <Button size="xs" leftSection={<IconPlus size={12} />} onClick={() => { setPutName(''); setPutData(''); openPut() }}>{t('objectStore.upload')}</Button>
            </Group>
            <Table striped highlightOnHover style={{ fontSize: 12 }}>
              <Table.Thead><Table.Tr><Table.Th>{t('objectStore.name')}</Table.Th><Table.Th>{t('objectStore.size')}</Table.Th><Table.Th>{t('objectStore.modified')}</Table.Th><Table.Th w={120}>{t('kv.actions')}</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {objects.map((o) => (
                  <Table.Tr key={o.name} style={{ opacity: o.deleted ? 0.4 : 1 }}>
                    <Table.Td ff="monospace" style={{ fontSize: 10 }}>{o.name}</Table.Td>
                    <Table.Td style={{ fontSize: 10 }}>{formatBytes(o.size)}</Table.Td>
                    <Table.Td style={{ fontSize: 10 }}>{o.modified}</Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        <ActionIcon variant="subtle" size="xs" onClick={() => handleView(o.name)}><IconEye size={12} /></ActionIcon>
                        <ActionIcon variant="subtle" size="xs" onClick={() => handleDownload(o.name)}><IconDownload size={12} /></ActionIcon>
                        <ActionIcon variant="subtle" color="red" size="xs" onClick={() => handleDelete(o.name)}><IconTrash size={12} /></ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
                {objects.length === 0 && <Table.Tr><Table.Td colSpan={4} ta="center" c="dimmed">{t('kv.noEntries')}</Table.Td></Table.Tr>}
              </Table.Tbody>
            </Table>
          </>
        ) : (
          <Text c="dimmed" ta="center" style={{ marginTop: 'auto', marginBottom: 'auto' }}>{t('objectStore.selectStore')}</Text>
        )}
      </div>

      <Modal opened={putOpen} onClose={closePut} title={t('objectStore.upload')} size="md">
        <Stack gap="xs">
          <TextInput label={t('objectStore.name')} value={putName} onChange={(e) => setPutName(e.target.value)} placeholder="file.dat" required />
          <Textarea label={t('objectStore.content')} value={putData} onChange={(e) => setPutData(e.target.value)} minRows={6} autosize />
          <Button onClick={handlePut}>{t('objectStore.upload')}</Button>
        </Stack>
      </Modal>

      <Modal opened={viewOpen} onClose={closeView} title={t('common.details')} size="lg">
        <pre style={{ background: 'var(--mantine-color-dark-6)', padding: 12, borderRadius: 4, fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 400, overflow: 'auto' }}>
          {viewData}
        </pre>
      </Modal>
    </div>
  )
}
