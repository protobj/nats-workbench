/**
 * @file 房间拓扑页面 – 在给定的"房间"命名空间内发现 NATS 主题，并显示发布者、订阅者和消息计数。
 */

import { useState } from 'react'
import { Title, Group, Button, TextInput, Text, Card, SimpleGrid, Badge } from '@mantine/core'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { notifications } from '@mantine/notifications'
import { IconSearch } from '@tabler/icons-react'
import { invoke } from '@tauri-apps/api/core'
import { useConnectionStore } from '@/stores/connectionStore'

interface RoomTopicInfo { subject: string; has_publisher: boolean; has_subscriber: boolean; message_count: number }

export function RoomTopologyPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const currentId = useConnectionStore((s) => s.currentConnectionId)
  /** 用于限定发现范围的房间标识符（例如 "room.123"）。 */
  const [roomId, setRoomId] = useState('')
  /** 为给定房间发现的主题元数据。 */
  const [topics, setTopics] = useState<RoomTopicInfo[]>([])
  /** 房间主题扫描是否正在进行中。 */
  const [scanning, setScanning] = useState(false)

  if (!currentId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
        <Title order={3} c="dimmed">{t('topics.noConnection')}</Title>
        <Button onClick={() => navigate('/connections')}>{t('nav.connections')}</Button>
      </div>
    )
  }

  /** 扫描给定房间前缀内的主题，并返回发布者/订阅者信息。 */
  async function handleScan() {
    if (!roomId.trim()) return
    setScanning(true); setTopics([])
    try {
      const r = await invoke<RoomTopicInfo[]>('discover_room_topics', { connectionId: currentId!, roomId: roomId.trim(), durationMs: 2000 })
      setTopics(r)
      notifications.show({ message: t('roomTopology.found', { count: r.length }), color: 'green' })
    } catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
    finally { setScanning(false) }
  }

  return (
    <div style={{ padding: 16 }}>
      <Title order={3} mb="md">{t('roomTopology.title')}</Title>
      <Text size="xs" c="dimmed" mb="md">{t('roomTopology.description')}</Text>

      <Group gap="xs" mb="lg">
        <TextInput
          placeholder={t('roomTopology.roomId')}
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          leftSection={<span style={{ fontSize: 11, color: 'var(--mantine-color-dimmed)' }}>room.</span>}
          style={{ flex: 1 }}
        />
        <Button leftSection={<IconSearch size={14} />} onClick={handleScan} loading={scanning}>{t('roomTopology.scan')}</Button>
      </Group>

      {topics.length > 0 && (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {topics.map((topic) => (
            <Card key={topic.subject} withBorder padding="sm">
              <Group justify="space-between" mb="xs">
                <Text size="xs" ff="monospace" fw={500}>{topic.subject}</Text>
                <Badge size="xs" color={topic.message_count > 0 ? 'green' : 'gray'}>{topic.message_count} {t('roomTopology.messages')}</Badge>
              </Group>
              <Group gap="xs">
                <Badge size="xs" color={topic.has_publisher ? 'blue' : 'gray'} leftSection={topic.has_publisher ? '●' : '○'}>{t('roomTopology.publisher')}</Badge>
                <Badge size="xs" color={topic.has_subscriber ? 'green' : 'gray'} leftSection={topic.has_subscriber ? '●' : '○'}>{t('roomTopology.subscriber')}</Badge>
              </Group>
            </Card>
          ))}
        </SimpleGrid>
      )}

      {!scanning && topics.length === 0 && roomId && (
        <Text c="dimmed" ta="center" mt={40}>{t('roomTopology.noTopics')}</Text>
      )}
    </div>
  )
}
