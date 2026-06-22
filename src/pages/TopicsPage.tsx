/**
 * @file 主题发现页面 – 扫描 NATS 集群中的活跃主题，以可筛选的树形结构展示，并可导航到消息查看器。
 */

import { Title, Group, Button, TextInput, Text } from '@mantine/core'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { IconSearch } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { useTopicStore } from '@/stores/topicStore'
import { useConnectionStore } from '@/stores/connectionStore'
import { SubjectTree } from '@/components/common/SubjectTree'

export function TopicsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const currentId = useConnectionStore((s) => s.currentConnectionId)
  const discoveredSubjects = useTopicStore((s) => s.discoveredSubjects)
  const discoverSubjects = useTopicStore((s) => s.discoverSubjects)
  const discovering = useTopicStore((s) => s.discovering)
  /** 客户端主题筛选文本。 */
  const [filter, setFilter] = useState('')

  if (!currentId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
        <Title order={3} c="dimmed">{t('topics.noConnection')}</Title>
        <Button onClick={() => navigate('/connections')}>{t('nav.connections')}</Button>
      </div>
    )
  }

  /** 触发对活跃连接的主题发现扫描。 */
  async function handleDiscover() {
    try { await discoverSubjects(currentId!) }
    catch (e: any) { notifications.show({ message: `${t('common.failed')}: ${e}`, color: 'red' }) }
  }

  /** 根据当前筛选文本在客户端过滤后的主题列表。 */
  const filtered = discoveredSubjects.filter((s) => !filter || s.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div style={{ padding: 16 }}>
      <Group justify="space-between" mb="md">
        <Title order={3}>{t('topics.title')}</Title>
        <Button size="xs" leftSection={<IconSearch size={14} />} loading={discovering} onClick={handleDiscover}>
          {t('topics.scan')}
        </Button>
      </Group>
      <TextInput placeholder={t('topics.filter')} value={filter} onChange={(e) => setFilter(e.target.value)} mb="sm" size="xs" />
      {filtered.length > 0 ? (
        <SubjectTree subjects={filter ? filtered : discoveredSubjects} onSelect={(subject) => navigate(`/messages?subject=${encodeURIComponent(subject)}`)} />
      ) : (
        <Text c="dimmed" ta="center" mt={40}>{t('topics.noSubjects')}</Text>
      )}
    </div>
  )
}
