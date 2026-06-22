/**
 * @file 服务器监控页面 – 显示 NATS 服务器健康指标（CPU、内存、连接数、消息速率）、慢消费者告警和 JetStream 状态。
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Title, Group, Button, SimpleGrid, Card, Text,
  Progress, Badge, Table, Stack, Center, Loader, ScrollArea,
} from '@mantine/core'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { IconRefresh, IconAlertTriangle, IconDatabase } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { invoke } from '@tauri-apps/api/core'
import { useConnectionStore } from '@/stores/connectionStore'

interface ServerStats {
  server_id: string; server_name: string; version: string; uptime: string
  cpu_percent: number; memory_mb: number; connections: number; subscriptions: number
  messages_in: number; messages_out: number; bytes_in: number; bytes_out: number
  slow_consumers: number; jetstream_enabled: boolean
}

interface SlowConsumer { client_id: string; name: string; addr: string; pending: number; subscriptions: string[] }
interface JetStreamSummary { streams: number; consumers: number; messages: number; bytes: number; pending: number }

/** 将原始字节数转换为人类可读的字符串（B/KB/MB/GB）。 */
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1073741824) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / 1073741824).toFixed(2)} GB`
}

/** 将大数字格式化为带 K/M 后缀的字符串（例如 1500 → "1.5K"）。 */
function formatNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

export function MonitorPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const currentId = useConnectionStore((s) => s.currentConnectionId)

  /** 从后端获取的服务器整体健康状态数据。 */
  const [stats, setStats] = useState<ServerStats | null>(null)
  /** 滞后消费者列表（待处理计数高）。 */
  const [slowConsumers, setSlowConsumers] = useState<SlowConsumer[]>([])
  /** JetStream 账户高层摘要（流/消费者/存储）。 */
  const [jetstream, setJetstream] = useState<JetStreamSummary | null>(null)
  /** API 获取周期是否正在进行中。 */
  const [loading, setLoading] = useState(false)

  /** 并行调用后端 API 以刷新所有监控面板。 */
  const fetchAll = useCallback(async () => {
    if (!currentId) return
    setLoading(true)
    try {
      const [s, sl, js] = await Promise.all([
        invoke<ServerStats>('fetch_server_stats', { connectionId: currentId }).catch(() => null),
        invoke<SlowConsumer[]>('fetch_slow_consumers', { connectionId: currentId }).catch(() => []),
        invoke<JetStreamSummary>('fetch_jetstream_summary', { connectionId: currentId }).catch(() => null),
      ])
      setStats(s); setSlowConsumers(sl); setJetstream(js)
    } catch { /* */ } finally { setLoading(false) }
  }, [currentId])

  useEffect(() => { fetchAll() }, [fetchAll])

  if (!currentId) {
    return (
      <Center h="100%">
        <Stack align="center" gap="md">
          <Title order={3} c="dimmed">{t('topics.noConnection')}</Title>
          <Button onClick={() => navigate('/connections')}>{t('nav.connections')}</Button>
        </Stack>
      </Center>
    )
  }

  return (
    <div style={{ padding: 16 }}>
      <Group justify="space-between" mb="md">
        <Title order={3}>{t('monitor.title')}</Title>
        <Button size="xs" variant="light" leftSection={<IconRefresh size={14} />} loading={loading} onClick={fetchAll}>{t('monitor.refresh')}</Button>
      </Group>

      {!stats && loading && <Center py={80}><Loader /></Center>}

      {stats && (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="md">
            <Card withBorder padding="sm">
              <Group justify="space-between" mb={4}>
                <Text size="xs" c="dimmed">{t('monitor.cpu')}</Text>
                <Badge size="xs" color={stats.cpu_percent > 80 ? 'red' : 'green'}>{stats.cpu_percent.toFixed(1)}%</Badge>
              </Group>
              <Progress value={stats.cpu_percent} color={stats.cpu_percent > 80 ? 'red' : 'green'} size="sm" />
            </Card>
            <Card withBorder padding="sm">
              <Group justify="space-between" mb={4}>
                <Text size="xs" c="dimmed">{t('monitor.memory')}</Text>
                <Badge size="xs" color="blue">{formatBytes(stats.memory_mb * 1024 * 1024)}</Badge>
              </Group>
              <Progress value={Math.min((stats.memory_mb / 1024) * 100, 100)} color="blue" size="sm" />
            </Card>
            <Card withBorder padding="sm">
              <Group justify="space-between" mb={4}>
                <Text size="xs" c="dimmed">{t('monitor.connections')}</Text>
                <Badge size="xs" color="teal">{stats.connections}</Badge>
              </Group>
              <Text size="xl" fw={700}>{stats.connections}</Text>
            </Card>
            <Card withBorder padding="sm">
              <Group justify="space-between" mb={4}>
                <Text size="xs" c="dimmed">{t('monitor.subscriptions')}</Text>
                <Badge size="xs" color="violet">{stats.subscriptions}</Badge>
              </Group>
              <Text size="xl" fw={700}>{formatNumber(stats.subscriptions)}</Text>
            </Card>
          </SimpleGrid>

          <Card withBorder padding="sm" mb="md">
            <Group justify="space-between" mb="xs">
              <Text fw={500} size="sm">{t('monitor.serverInfo')}</Text>
              <Badge size="xs" color="indigo">v{stats.version}</Badge>
            </Group>
            <SimpleGrid cols={4} spacing="xs">
              <div><Text size="xs" c="dimmed">{t('monitor.id')}</Text><Text size="xs" ff="monospace">{stats.server_id?.slice(0, 16) || '-'}</Text></div>
              <div><Text size="xs" c="dimmed">{t('monitor.name')}</Text><Text size="xs">{stats.server_name || '-'}</Text></div>
              <div><Text size="xs" c="dimmed">{t('monitor.uptime')}</Text><Text size="xs">{stats.uptime || '-'}</Text></div>
              <div><Text size="xs" c="dimmed">{t('monitor.jetstream')}</Text><Badge size="xs" color={stats.jetstream_enabled ? 'green' : 'gray'}>{stats.jetstream_enabled ? t('monitor.enabled') : t('monitor.disabled')}</Badge></div>
            </SimpleGrid>
          </Card>

          <SimpleGrid cols={2} mb="md">
            <Card withBorder padding="sm">
              <Text fw={500} size="sm" mb="xs">{t('jetstream.messages')}</Text>
              <Group>
                <div><Text size="xs" c="dimmed">{t('monitor.totalIn')}</Text><Text size="lg" fw={600}>{formatNumber(stats.messages_in)}</Text></div>
                <div><Text size="xs" c="dimmed">{t('monitor.totalOut')}</Text><Text size="lg" fw={600}>{formatNumber(stats.messages_out)}</Text></div>
                <div><Text size="xs" c="dimmed">{t('monitor.bytesIn')}</Text><Text size="lg" fw={600}>{formatBytes(stats.bytes_in)}</Text></div>
                <div><Text size="xs" c="dimmed">{t('monitor.bytesOut')}</Text><Text size="lg" fw={600}>{formatBytes(stats.bytes_out)}</Text></div>
              </Group>
            </Card>

            {jetstream && (
              <Card withBorder padding="sm">
                <Text fw={500} size="sm" mb="xs"><IconDatabase size={14} style={{ display: 'inline', marginRight: 4 }} />{t('monitor.jetstreamOverview')}</Text>
                <Group>
                  <div><Text size="xs" c="dimmed">{t('monitor.streams')}</Text><Text size="lg" fw={600}>{jetstream.streams}</Text></div>
                  <div><Text size="xs" c="dimmed">{t('monitor.consumers')}</Text><Text size="lg" fw={600}>{jetstream.consumers}</Text></div>
                  <div><Text size="xs" c="dimmed">{t('jetstream.messages')}</Text><Text size="lg" fw={600}>{formatNumber(jetstream.messages)}</Text></div>
                  <div><Text size="xs" c="dimmed">{t('monitor.storage')}</Text><Text size="lg" fw={600}>{formatBytes(jetstream.bytes)}</Text></div>
                </Group>
              </Card>
            )}
          </SimpleGrid>

          <Card withBorder padding="sm">
            <Group justify="space-between" mb="xs">
              <Text fw={500} size="sm">
                <IconAlertTriangle size={14} style={{ display: 'inline', marginRight: 4 }} color={slowConsumers.length > 0 ? 'var(--mantine-color-red-6)' : 'var(--mantine-color-gray-6)'} />
                {t('monitor.slowConsumers')}
              </Text>
              <Badge size="xs" color={slowConsumers.length > 0 ? 'red' : 'gray'}>{slowConsumers.length}</Badge>
            </Group>
            {slowConsumers.length > 0 ? (
              <ScrollArea h={200}>
                <Table striped highlightOnHover style={{ fontSize: 12 }}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t('monitor.name')}</Table.Th>
                      <Table.Th>{t('monitor.address')}</Table.Th>
                      <Table.Th>{t('monitor.pending')}</Table.Th>
                      <Table.Th>{t('monitor.subscriptionsList')}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {slowConsumers.map((c) => (
                      <Table.Tr key={c.client_id}>
                        <Table.Td>{c.name || c.client_id.slice(0, 8)}</Table.Td>
                        <Table.Td ff="monospace" style={{ fontSize: 10 }}>{c.addr}</Table.Td>
                        <Table.Td><Badge size="xs" color="red">{c.pending}</Badge></Table.Td>
                        <Table.Td ff="monospace" style={{ fontSize: 10 }}>{c.subscriptions.join(', ') || '-'}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            ) : (
              <Text size="xs" c="dimmed" ta="center" py="md">{t('monitor.noSlowConsumers')}</Text>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
