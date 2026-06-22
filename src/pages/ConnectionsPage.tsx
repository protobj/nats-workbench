/**
 * @file 连接管理页面 – 创建、编辑、导入、导出、测试和连接到 NATS 服务器配置。列出所有已保存的连接配置。
 */

import { useState } from 'react'
import { Title, Group, Button, Table, Modal, Text, TextInput, ActionIcon, Tooltip } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { IconPlus, IconDownload, IconTrash, IconFileText } from '@tabler/icons-react'
import { useConnectionStore } from '@/stores/connectionStore'
import { ConnectionForm } from '@/components/common/ConnectionForm'
import { emptyConfig, type ConnectionConfig } from '@/types'

export function ConnectionsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const savedConfigs = useConnectionStore((s) => s.savedConfigs)
  const saveConfig = useConnectionStore((s) => s.saveConfig)
  const deleteConfig = useConnectionStore((s) => s.deleteConfig)
  const exportConfig = useConnectionStore((s) => s.exportConfig)
  const importConfig = useConnectionStore((s) => s.importConfig)
  const connect = useConnectionStore((s) => s.connect)
  const testConnection = useConnectionStore((s) => s.testConnection)

  /** 控制创建/编辑弹窗的显示/隐藏。 */
  const [modalOpen, { open, close }] = useDisclosure(false)
  /** 控制 JSON 导入弹窗的显示/隐藏。 */
  const [importOpen, { open: openImport, close: closeImport }] = useDisclosure(false)
  /** 存储正在编辑的连接配置（新建或已有）。 */
  const [editing, setEditing] = useState<ConnectionConfig>(emptyConfig())
  /** 保存操作是否正在进行中。 */
  const [saving, setSaving] = useState(false)
  /** 连接测试是否正在进行中。 */
  const [testing, setTesting] = useState(false)
  /** 导入文本域的原始 JSON 字符串。 */
  const [importJson, setImportJson] = useState('')

  /** 打开空白"新建"配置的连接表单。 */
  function handleNew() { setEditing(emptyConfig()); open() }

  /** 验证并保存配置，然后连接并导航到首页。 */
  async function handleSave() {
    setSaving(true)
    try {
      await saveConfig(editing); close()
      await connect(editing)
      notifications.show({ message: t('connections.connected'), color: 'green' })
      navigate('/')
    } catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
    finally { setSaving(false) }
  }

  /** 测试当前配置（不保存）– 显示延迟/RTT。 */
  async function handleTest() {
    setTesting(true)
    try {
      const r = await testConnection(editing)
      notifications.show({ message: r, color: 'green' })
    } catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
    finally { setTesting(false) }
  }

  /** 使用已保存的配置进行连接并导航到首页。 */
  async function handleConnect(config: ConnectionConfig) {
    try {
      await connect(config)
      notifications.show({ message: t('connections.connected'), color: 'green' })
      navigate('/')
    } catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
  }

  /** 用户确认后删除连接配置。 */
  async function handleDelete(id: string, label: string) {
    if (!confirm(`${t('connections.confirmDelete')}`)) return
    await deleteConfig(id)
    notifications.show({ message: t('connections.deleted'), color: 'green' })
  }

  /** 将连接配置以 JSON 格式导出到剪贴板。 */
  async function handleExport(id: string) {
    try {
      await navigator.clipboard.writeText(await exportConfig(id))
      notifications.show({ message: t('connections.copiedClipboard'), color: 'green' })
    } catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
  }

  /** 从 JSON 字符串导入连接配置。 */
  async function handleImport() {
    if (!importJson.trim()) return
    try {
      await importConfig(importJson.trim())
      closeImport()
      notifications.show({ message: t('connections.imported'), color: 'green' })
    } catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
  }

  return (
    <div style={{ padding: 16 }}>
      <Group justify="space-between" mb="md">
        <Title order={3}>{t('connections.title')}</Title>
        <Group>
          <Button size="xs" leftSection={<IconPlus size={14} />} onClick={handleNew}>{t('connections.newConnection')}</Button>
          <Button size="xs" variant="light" leftSection={<IconDownload size={14} />} onClick={openImport}>{t('connections.import')}</Button>
        </Group>
      </Group>

      {savedConfigs.length > 0 ? (
        <Table striped highlightOnHover withTableBorder style={{ fontSize: 12 }}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('connections.label')}</Table.Th>
              <Table.Th>{t('connections.servers')}</Table.Th>
              <Table.Th w={100}>{t('connections.auth')}</Table.Th>
              <Table.Th w={200}>{t('connections.actions')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {savedConfigs.map((c) => (
              <Table.Tr key={c.id}>
                <Table.Td>{c.label || c.id.slice(0, 8)}</Table.Td>
                <Table.Td style={{ fontFamily: 'monospace', fontSize: 11 }}>{c.servers.join(', ')}</Table.Td>
                <Table.Td>{(c.auth as any).type || 'none'}</Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    <Button size="compact-xs" variant="light" onClick={() => handleConnect(c)}>{t('connections.connect')}</Button>
                    <Button size="compact-xs" variant="light" onClick={() => { setEditing(JSON.parse(JSON.stringify(c))); open() }}>{t('connections.edit')}</Button>
                    <Tooltip label="Copy JSON"><ActionIcon variant="subtle" size="sm" onClick={() => handleExport(c.id)}><IconFileText size={14} /></ActionIcon></Tooltip>
                    <ActionIcon variant="subtle" color="red" size="sm" onClick={() => handleDelete(c.id, c.label)}><IconTrash size={14} /></ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      ) : (
        <Text c="dimmed" ta="center" mt={60}>{t('connections.empty')}</Text>
      )}

      <Modal opened={modalOpen} onClose={close} title={t('connections.configTitle')} size="xl">
        <ConnectionForm value={editing} onChange={setEditing} />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={handleTest} loading={testing}>{t('connections.test')}</Button>
          <Button onClick={handleSave} loading={saving}>{t('connections.saveAndConnect')}</Button>
        </Group>
      </Modal>

      <Modal opened={importOpen} onClose={closeImport} title={t('connections.importTitle')} size="md">
        <TextInput value={importJson} onChange={(e) => setImportJson(e.target.value)} placeholder={t('connections.importPlaceholder')} mb="md" />
        <Group justify="flex-end">
          <Button variant="default" onClick={closeImport}>{t('common.cancel')}</Button>
          <Button onClick={handleImport}>{t('connections.import')}</Button>
        </Group>
      </Modal>
    </div>
  )
}
