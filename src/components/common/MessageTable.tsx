/**
 * NATS 消息列表表格，带详情弹窗。
 * 在可滚动表格中显示接收到的消息，列包括时间戳、
 * 主题、回复、截断的有效载荷和大小。双击
 * 或点击眼睛图标可打开显示完整有效载荷和元数据的弹窗。
 *
 * @file 消息列表表格
 */
import { Table, ActionIcon, Modal, ScrollArea, Code } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconEye } from '@tabler/icons-react'
import type { NatsMessageEvent } from '@/types'

function formatTime(ts: number) { const d = new Date(ts); return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + (ts % 1000).toString().padStart(3, '0') }
function formatSize(bytes: number) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / (1024 * 1024)).toFixed(1)} MB` }
function tryFormatJson(s: string) { try { return JSON.stringify(JSON.parse(s), null, 2) } catch { return s } }

/** 消息表格组件的属性。 */
interface Props { messages: NatsMessageEvent[] }

export function MessageTable({ messages }: Props) {
  const { t } = useTranslation()
  const [opened, { open, close }] = useDisclosure(false)
  const [selected, setSelected] = useState<NatsMessageEvent | null>(null)

  return (
    <>
      <ScrollArea h="calc(100vh - 200px)">
        <Table striped highlightOnHover withTableBorder withColumnBorders stickyHeader style={{ fontSize: 12 }}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={100}>{t('messages.time')}</Table.Th>
              <Table.Th w={180}>{t('messages.subject')}</Table.Th>
              <Table.Th w={120}>{t('messages.reply')}</Table.Th>
              <Table.Th>{t('messages.payload')}</Table.Th>
              <Table.Th w={70}>{t('messages.size')}</Table.Th>
              <Table.Th w={36}></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {messages.map((msg, i) => (
              <Table.Tr key={`${msg.timestamp}-${i}`} style={{ cursor: 'pointer' }} onDoubleClick={() => { setSelected(msg); open() }}>
                <Table.Td style={{ fontFamily: 'monospace', fontSize: 10 }}>{formatTime(msg.timestamp)}</Table.Td>
                <Table.Td c="blue.4" style={{ fontFamily: 'monospace', fontSize: 10 }}>{msg.subject}</Table.Td>
                <Table.Td c="dimmed" style={{ fontFamily: 'monospace', fontSize: 10 }}>{msg.reply || '-'}</Table.Td>
                <Table.Td style={{ fontFamily: 'monospace', fontSize: 10 }}>{msg.payload.length > 100 ? msg.payload.slice(0, 100) + '...' : msg.payload}</Table.Td>
                <Table.Td style={{ fontSize: 10 }}>{formatSize(msg.size)}</Table.Td>
                <Table.Td><ActionIcon variant="subtle" size="xs" onClick={() => { setSelected(msg); open() }}><IconEye size={12} /></ActionIcon></Table.Td>
              </Table.Tr>
            ))}
            {messages.length === 0 && <Table.Tr><Table.Td colSpan={6} ta="center" c="dimmed" py="xl">{t('messages.noMessages')}</Table.Td></Table.Tr>}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      <Modal opened={opened} onClose={close} title={t('messages.messageDetail')} size="lg">
        {selected && <><Code block mb="sm" style={{ fontSize: 11 }}>{t('messages.subject')}: {selected.subject}{'\n'}{t('messages.reply')}: {selected.reply || '-'}{'\n'}{t('messages.time')}: {formatTime(selected.timestamp)}{'\n'}{t('messages.size')}: {formatSize(selected.size)}</Code><Code block style={{ fontSize: 11, whiteSpace: 'pre-wrap' }}>{tryFormatJson(selected.payload)}</Code></>}
      </Modal>
    </>
  )
}
