/**
 * @file 仪表盘页面 – 展示所有活跃 NATS 连接的总览，每个连接的健康卡片显示延迟、吞吐量和状态。
 */

import { Card, SimpleGrid, Title, Group, Button, Text } from '@mantine/core'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { IconRefresh, IconPlugConnected } from '@tabler/icons-react'
import { useConnectionStore } from '@/stores/connectionStore'
import { StatusBadge } from '@/components/common/StatusBadge'

/** 将原始字节数转换为人类可读的字符串（B/KB/MB）。 */
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes.toFixed(0)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const activeStatuses = useConnectionStore((s) => s.activeStatuses)
  const refreshActiveConnections = useConnectionStore((s) => s.refreshActiveConnections)
  const disconnect = useConnectionStore((s) => s.disconnect)

  /** 从 store 中的状态派生的活跃连接列表。 */
  const connections = Array.from(activeStatuses.entries())

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
  )
}
