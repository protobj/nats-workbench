/**
 * @file 仪表盘页面 – 连接概览与实时服务器诊断（双选项卡）
 */

import { useState } from 'react'
import { Card, SimpleGrid, Title, Group, Button, Text, Tabs, Badge, Stack, Code } from '@mantine/core'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'
import {
  IconRefresh,
  IconPlugConnected,
  IconServer,
  IconActivity,
  IconBolt,
  IconPlugOff,
  IconArrowsExchange,
} from '@tabler/icons-react'
import { useConnectionStore } from '@/stores/connectionStore'
import { StatusBadge } from '@/components/common/StatusBadge'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes.toFixed(0)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface ServerInfo {
  server_id: string
  server_name: string
  version: string
  go_version: string
  host: string
  port: number
  max_payload: number
  proto_version: number
  cluster: string | null
  connect_urls: string[]
  nonce: string | null
  jetstream: boolean
  client_id: number
  client_ip: string
}

interface ClientStats {
  messages_sent: number
  messages_received: number
  bytes_sent: number
  bytes_received: number
  reconnects: number
  pings_sent: number
  pongs_received: number
  subscriptions: number
  slow_consumers: number
}

interface ConnState {
  state: string
  is_connected: boolean
  is_reconnecting: boolean
  is_closed: boolean
}

export function DashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const activeStatuses = useConnectionStore((s) => s.activeStatuses)
  const currentConnectionId = useConnectionStore((s) => s.currentConnectionId)
  const refreshActiveConnections = useConnectionStore((s) => s.refreshActiveConnections)
  const disconnect = useConnectionStore((s) => s.disconnect)

  const [activeTab, setActiveTab] = useState<string | null>('overview')
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null)
  const [clientStats, setClientStats] = useState<ClientStats | null>(null)
  const [connState, setConnState] = useState<ConnState | null>(null)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const connections = Array.from(activeStatuses.entries())

  const refreshServerInfo = async () => {
    if (!currentConnectionId) return
    setLoading(true)
    try {
      const [info, stats, state] = await Promise.all([
        invoke<ServerInfo>('fetch_server_info', { connectionId: currentConnectionId }).catch(() => null),
        invoke<ClientStats>('fetch_client_statistics', { connectionId: currentConnectionId }).catch(() => null),
        invoke<ConnState>('fetch_connection_state', { connectionId: currentConnectionId }).catch(() => null),
      ])
      setServerInfo(info)
      setClientStats(stats)
      setConnState(state)
    } finally {
      setLoading(false)
    }
  }

  const doAction = async (cmd: string) => {
    if (!currentConnectionId) return
    setActionLoading(cmd)
    try {
      await invoke(cmd, { connectionId: currentConnectionId })
      await refreshServerInfo()
    } catch (e) {
      console.error(`${cmd} failed:`, e)
    } finally {
      setActionLoading(null)
    }
  }

  if (connections.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
        <Title order={3} c="dimmed">{t('dashboard.noConnections')}</Title>
        <Button leftSection={<IconPlugConnected size={16} />} onClick={() => navigate('/connections')}>
          {t('dashboard.configure')}
        </Button>
      </div>
    )
  }

  return (
    <Tabs value={activeTab} onChange={setActiveTab}>
      <Tabs.List>
        <Tabs.Tab value="overview" leftSection={<IconServer size={14} />}>
          {t('dashboard.title')}
        </Tabs.Tab>
        <Tabs.Tab value="serverInfo" leftSection={<IconActivity size={14} />}>
          {t('dashboard.serverInfo')}
        </Tabs.Tab>
      </Tabs.List>

      {/* ---------- Tab 1: Connection Overview ---------- */}
      <Tabs.Panel value="overview">
        <div style={{ padding: 16 }}>
          <Group justify="space-between" mb="md">
            <Title order={3}>{t('dashboard.title')}</Title>
            <Button size="xs" variant="light" leftSection={<IconRefresh size={14} />} onClick={refreshActiveConnections}>
              {t('dashboard.refresh')}
            </Button>
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
            {connections.map(([id, conn]) => (
              <Card key={id} shadow="sm" padding="sm" withBorder>
                <Card.Section withBorder inheritPadding py="xs">
                  <Group justify="space-between">
                    <Group gap="xs">
                      <StatusBadge state={conn.state} rttMs={conn.rtt_ms} />
                      <Text size="sm" fw={500}>{conn.label || id.slice(0, 8)}</Text>
                    </Group>
                  </Group>
                </Card.Section>
                <Group gap="xs" mt="xs" style={{ fontSize: 12 }}>
                  <Text c="dimmed" span size="xs">{t('dashboard.server')}:</Text>
                  <Text span size="xs" ff="monospace">{conn.server_addr}</Text>
                </Group>
                <Group gap="xs" mt={2} style={{ fontSize: 12 }}>
                  <Text c="dimmed" span size="xs">{t('dashboard.rtt')}:</Text>
                  <Text span size="xs" c={conn.rtt_ms > 5 ? 'yellow' : undefined} fw={conn.rtt_ms > 5 ? 500 : 400}>
                    {conn.rtt_ms.toFixed(2)} ms
                  </Text>
                  <Text c="dimmed" span size="xs">{t('dashboard.msgsPerSec')}:</Text>
                  <Text span size="xs">{conn.msgs_in_per_sec.toFixed(0)} {t('dashboard.in')} / {conn.msgs_out_per_sec.toFixed(0)} {t('dashboard.out')}</Text>
                </Group>
                <Group gap="xs" mt={2} style={{ fontSize: 12 }}>
                  <Text c="dimmed" span size="xs">{t('dashboard.bytesPerSec')}:</Text>
                  <Text span size="xs">{formatBytes(conn.bytes_in_per_sec)} {t('dashboard.in')} / {formatBytes(conn.bytes_out_per_sec)} {t('dashboard.out')}</Text>
                  <Text c="dimmed" span size="xs">{t('dashboard.reconnects')}:</Text>
                  <Text span size="xs">{conn.reconnect_count}</Text>
                </Group>
                <Button fullWidth size="xs" color="red" variant="light" mt="sm" onClick={() => disconnect(id)}>
                  {t('dashboard.disconnect')}
                </Button>
              </Card>
            ))}
          </SimpleGrid>
        </div>
      </Tabs.Panel>

      {/* ---------- Tab 2: Server Info ---------- */}
      <Tabs.Panel value="serverInfo">
        <div style={{ padding: 16 }}>
          <Group justify="space-between" mb="md">
            <Title order={3}>{t('dashboard.serverInfo')}</Title>
            <Group gap="xs">
              {currentConnectionId && (
                <>
                  <Button size="xs" variant="light" leftSection={<IconBolt size={14} />} loading={actionLoading === 'flush_connection'} onClick={() => doAction('flush_connection')}>
                    {t('dashboard.flush')}
                  </Button>
                  <Button size="xs" variant="light" color="yellow" leftSection={<IconPlugOff size={14} />} loading={actionLoading === 'drain_connection'} onClick={() => doAction('drain_connection')}>
                    {t('dashboard.drain')}
                  </Button>
                  <Button size="xs" variant="light" color="orange" leftSection={<IconArrowsExchange size={14} />} loading={actionLoading === 'force_reconnect'} onClick={() => doAction('force_reconnect')}>
                    {t('dashboard.forceReconnect')}
                  </Button>
                </>
              )}
              <Button size="xs" variant="light" leftSection={<IconRefresh size={14} />} loading={loading} onClick={refreshServerInfo}>
                {t('dashboard.refresh')}
              </Button>
            </Group>
          </Group>

          {!currentConnectionId ? (
            <Text c="dimmed">{t('dashboard.noConnection')}</Text>
          ) : (
            <Stack gap="md">
              <Group gap="xs" align="center">
                <Text size="sm" fw={500}>{t('dashboard.connectionState')}:</Text>
                {connState && (
                  <Badge
                    color={connState.is_connected ? 'green' : connState.is_reconnecting ? 'yellow' : 'red'}
                    variant="light"
                  >
                    {connState.state}
                  </Badge>
                )}
              </Group>

              <SimpleGrid cols={{ base: 1, md: 2 }}>
                <Card shadow="sm" padding="md" withBorder>
                  <Text fw={500} mb="sm">{t('dashboard.serverDetails')}</Text>
                  {serverInfo ? (
                    <Stack gap={4}>
                      <Group gap="xs"><Text size="xs" c="dimmed" span>{t('monitor.id')}:</Text><Code>{serverInfo.server_id}</Code></Group>
                      <Group gap="xs"><Text size="xs" c="dimmed" span>{t('monitor.name')}:</Text><Text size="xs" span>{serverInfo.server_name}</Text></Group>
                      <Group gap="xs"><Text size="xs" c="dimmed" span>{t('dashboard.version')}:</Text><Text size="xs" span ff="monospace">{serverInfo.version}</Text></Group>
                      <Group gap="xs"><Text size="xs" c="dimmed" span>{t('dashboard.goVersion')}:</Text><Text size="xs" span ff="monospace">{serverInfo.go_version}</Text></Group>
                      <Group gap="xs"><Text size="xs" c="dimmed" span>{t('dashboard.hostPort')}:</Text><Text size="xs" span ff="monospace">{serverInfo.host}:{serverInfo.port}</Text></Group>
                      <Group gap="xs"><Text size="xs" c="dimmed" span>{t('dashboard.maxPayload')}:</Text><Text size="xs" span>{formatBytes(serverInfo.max_payload)}</Text></Group>
                      <Group gap="xs"><Text size="xs" c="dimmed" span>{t('dashboard.cluster')}:</Text><Text size="xs" span>{serverInfo.cluster || t('monitor.disabled')}</Text></Group>
                      <Group gap="xs"><Text size="xs" c="dimmed" span>{t('monitor.jetstream')}:</Text>
                        <Badge size="xs" color={serverInfo.jetstream ? 'green' : 'gray'} variant="light">
                          {serverInfo.jetstream ? t('monitor.enabled') : t('monitor.disabled')}
                        </Badge>
                      </Group>
                    </Stack>
                  ) : (
                    <Text size="xs" c="dimmed">{t('dashboard.refresh')} {t('dashboard.serverDetails').toLowerCase()}</Text>
                  )}
                </Card>

                <Card shadow="sm" padding="md" withBorder>
                  <Text fw={500} mb="sm">{t('dashboard.clientStats')}</Text>
                  {clientStats ? (
                    <Stack gap={4}>
                      <Group gap="xs"><Text size="xs" c="dimmed" span>{t('dashboard.messagesSent')}:</Text><Text size="xs" span>{clientStats.messages_sent.toLocaleString()}</Text></Group>
                      <Group gap="xs"><Text size="xs" c="dimmed" span>{t('dashboard.messagesReceived')}:</Text><Text size="xs" span>{clientStats.messages_received.toLocaleString()}</Text></Group>
                      <Group gap="xs"><Text size="xs" c="dimmed" span>{t('dashboard.bytesSent')}:</Text><Text size="xs" span>{formatBytes(clientStats.bytes_sent)}</Text></Group>
                      <Group gap="xs"><Text size="xs" c="dimmed" span>{t('dashboard.bytesReceived')}:</Text><Text size="xs" span>{formatBytes(clientStats.bytes_received)}</Text></Group>
                      <Group gap="xs"><Text size="xs" c="dimmed" span>{t('dashboard.reconnects')}:</Text><Text size="xs" span>{clientStats.reconnects}</Text></Group>
                      <Group gap="xs"><Text size="xs" c="dimmed" span>{t('dashboard.pingsSent')}:</Text><Text size="xs" span>{clientStats.pings_sent}</Text></Group>
                      <Group gap="xs"><Text size="xs" c="dimmed" span>{t('dashboard.pongsReceived')}:</Text><Text size="xs" span>{clientStats.pongs_received}</Text></Group>
                      <Group gap="xs"><Text size="xs" c="dimmed" span>{t('dashboard.slowConsumers')}:</Text><Text size="xs" span c={clientStats.slow_consumers > 0 ? 'red' : undefined}>{clientStats.slow_consumers}</Text></Group>
                    </Stack>
                  ) : (
                    <Text size="xs" c="dimmed">{t('dashboard.refresh')} {t('dashboard.clientStats').toLowerCase()}</Text>
                  )}
                </Card>
              </SimpleGrid>
            </Stack>
          )}
        </div>
      </Tabs.Panel>
    </Tabs>
  )
}
