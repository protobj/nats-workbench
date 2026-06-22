/**
 * @file 性能测试页面 – 运行可配置的 NATS 发布性能测试，测量吞吐量、延迟百分位数和消息投递统计。
 */

import { useState } from 'react'
import { Title, Group, Button, Stack, NumberInput, Card, Text, Table } from '@mantine/core'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { notifications } from '@mantine/notifications'
import { IconPlayerPlay } from '@tabler/icons-react'
import { invoke } from '@tauri-apps/api/core'
import { useConnectionStore } from '@/stores/connectionStore'
import { TopicInput } from '@/components/common/TopicInput'

interface BenchmarkResult { messages_sent: number; messages_recv: number; elapsed_secs: number; throughput_per_sec: number; latency_p50_ms: number; latency_p99_ms: number; latency_min_ms: number; latency_max_ms: number }

export function BenchmarkPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const currentId = useConnectionStore((s) => s.currentConnectionId)
  /** 要发布性能测试消息的主题。 */
  const [subject, setSubject] = useState('bench.test')
  /** 每条性能测试消息的负载大小（字节）。 */
  const [payloadSize, setPayloadSize] = useState<number>(128)
  /** 目标发布速率（每秒消息数）。 */
  const [rate, setRate] = useState<number>(100)
  /** 性能测试持续时间（秒）。 */
  const [duration, setDuration] = useState<number>(5)
  /** 性能测试是否正在运行中。 */
  const [running, setRunning] = useState(false)
  /** 最近一次完成的性能测试的结果数据。 */
  const [result, setResult] = useState<BenchmarkResult | null>(null)

  if (!currentId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
        <Title order={3} c="dimmed">{t('topics.noConnection')}</Title>
        <Button onClick={() => navigate('/connections')}>{t('nav.connections')}</Button>
      </div>
    )
  }

  /** 使用配置的参数启动性能测试。 */
  async function handleRun() {
    setRunning(true); setResult(null)
    try {
      const r = await invoke<BenchmarkResult>('run_benchmark', { config: { connection_id: currentId!, subject, payload_size: payloadSize, rate_per_sec: rate, duration_secs: duration, reply_callback: false } })
      setResult(r); notifications.show({ message: `${t('common.success')}: ${r.throughput_per_sec.toFixed(0)} msg/s`, color: 'green' })
    } catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
    finally { setRunning(false) }
  }

  return (
    <div style={{ padding: 16 }}>
      <Title order={3} mb="md">{t('benchmark.title')}</Title>
      <Stack gap="xs" maw={500}>
        <TopicInput value={subject} onChange={setSubject} placeholder="bench.test" />
        <NumberInput label={t('benchmark.payloadSize')} value={payloadSize} onChange={(v) => setPayloadSize(Number(v))} min={16} max={1048576} />
        <NumberInput label={t('benchmark.publishRate')} value={rate} onChange={(v) => setRate(Number(v))} min={1} max={100000} />
        <NumberInput label={t('benchmark.duration')} value={duration} onChange={(v) => setDuration(Number(v))} min={1} max={300} />
        <Button leftSection={<IconPlayerPlay size={14} />} onClick={handleRun} loading={running}>{t('benchmark.run')}</Button>
      </Stack>

      {result && (
        <Card withBorder mt="lg" padding="md" maw={600}>
          <Text fw={600} mb="xs">{t('benchmark.results')}</Text>
          <Table style={{ fontSize: 12 }}>
            <Table.Tbody>
              <Table.Tr><Table.Td>{t('benchmark.messagesSent')}</Table.Td><Table.Td fw={500}>{result.messages_sent}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>{t('benchmark.duration')}</Table.Td><Table.Td>{result.elapsed_secs.toFixed(2)}s</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>{t('benchmark.throughput')}</Table.Td><Table.Td fw={500} c="green">{result.throughput_per_sec.toFixed(0)} msg/s</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>{t('benchmark.p50Latency')}</Table.Td><Table.Td c={result.latency_p50_ms > 5 ? 'yellow' : 'green'}>{result.latency_p50_ms.toFixed(3)} ms</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>{t('benchmark.p99Latency')}</Table.Td><Table.Td c={result.latency_p99_ms > 10 ? 'red' : 'yellow'}>{result.latency_p99_ms.toFixed(3)} ms</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>{t('benchmark.minLatency')}</Table.Td><Table.Td>{result.latency_min_ms.toFixed(3)} ms</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>{t('benchmark.maxLatency')}</Table.Td><Table.Td c="red">{result.latency_max_ms.toFixed(3)} ms</Table.Td></Table.Tr>
            </Table.Tbody>
          </Table>
        </Card>
      )}
    </div>
  )
}
