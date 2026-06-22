/**
 * @file 流重放页面 – 将 JetStream 消息从源流重放到目标 NATS 主题，支持可配置的序列号范围和消息间隔延迟。
 */

import { useState, useEffect } from 'react'
import { Title, Group, Button, Stack, NumberInput, Text, Card, Table, TextInput } from '@mantine/core'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { notifications } from '@mantine/notifications'
import { IconPlayerPlay } from '@tabler/icons-react'
import { invoke } from '@tauri-apps/api/core'
import { useConnectionStore } from '@/stores/connectionStore'
import { TopicInput } from '@/components/common/TopicInput'

interface ReplayProgress { total: number; replayed: number; skipped: number; done: boolean }

export function ReplayPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const currentId = useConnectionStore((s) => s.currentConnectionId)
  /** 要从中重放消息的源 JetStream 流名称。 */
  const [streamName, setStreamName] = useState('')
  /** 将重放的消息发布到的目标 NATS 主题。 */
  const [targetSubject, setTargetSubject] = useState('')
  /** 源流中的起始序列号。 */
  const [startSeq, setStartSeq] = useState<number>(1)
  /** 要重放的最大消息数量。 */
  const [count, setCount] = useState<number>(100)
  /** 每条重放消息之间的延迟（毫秒）。 */
  const [delayMs, setDelayMs] = useState<number>(0)
  /** 重放操作是否正在运行中。 */
  const [running, setRunning] = useState(false)
  /** 最近一次完成的重放的进度快照。 */
  const [progress, setProgress] = useState<ReplayProgress | null>(null)

  useEffect(() => {
    async function load() {
      if (!currentId) return
      try {
        const streams = await invoke<any[]>('list_streams', { connectionId: currentId })
        if (streams.length > 0) setStreamName(streams[0].name)
      } catch {}
    }
    load()
  }, [currentId])

  if (!currentId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
        <Title order={3} c="dimmed">{t('topics.noConnection')}</Title>
        <Button onClick={() => navigate('/connections')}>{t('nav.connections')}</Button>
      </div>
    )
  }

  /** 使用配置的参数启动流重放。 */
  async function handleReplay() {
    if (!streamName.trim() || !targetSubject.trim()) return
    setRunning(true); setProgress(null)
    try {
      const r = await invoke<ReplayProgress>('replay_stream_messages', { config: { connection_id: currentId!, stream_name: streamName.trim(), target_subject: targetSubject.trim(), start_seq: startSeq || null, count, delay_ms: delayMs || null } })
      setProgress(r)
      notifications.show({ message: `${t('common.success')}: ${r.replayed}/${r.total}`, color: 'green' })
    } catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
    finally { setRunning(false) }
  }

  return (
    <div style={{ padding: 16 }}>
      <Title order={3} mb="md">{t('replay.title')}</Title>
      <Stack gap="xs" maw={500}>
        <Text size="xs" c="dimmed">{t('replay.description')}</Text>
        <TextInput label={t('replay.streamName')} value={streamName} onChange={(e) => setStreamName(e.target.value)} placeholder="MY_STREAM" required />
        <TopicInput value={targetSubject} onChange={setTargetSubject} placeholder="replay.target.subject" />
        <NumberInput label={t('jetstream.startSeq')} value={startSeq} onChange={(v) => setStartSeq(Number(v))} min={1} />
        <NumberInput label={t('replay.maxMessages')} value={count} onChange={(v) => setCount(Number(v))} min={1} max={10000} />
        <NumberInput label={t('replay.delayBetween')} value={delayMs} onChange={(v) => setDelayMs(Number(v))} min={0} max={10000} />
        <Button leftSection={<IconPlayerPlay size={14} />} onClick={handleReplay} loading={running}>{t('replay.startReplay')}</Button>
      </Stack>

      {progress && progress.done && (
        <Card withBorder mt="lg" padding="md" maw={600}>
          <Text fw={600} mb="xs">{t('replay.replayComplete')}</Text>
          <Table style={{ fontSize: 12 }}>
            <Table.Tbody>
              <Table.Tr><Table.Td>{t('replay.totalMessages')}</Table.Td><Table.Td fw={500}>{progress.total}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>{t('replay.replayed')}</Table.Td><Table.Td fw={500} c="green">{progress.replayed}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>{t('replay.skipped')}</Table.Td><Table.Td c={progress.skipped > 0 ? 'yellow' : undefined}>{progress.skipped}</Table.Td></Table.Tr>
            </Table.Tbody>
          </Table>
        </Card>
      )}
    </div>
  )
}
