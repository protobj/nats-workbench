/**
 * 应用标题栏。
 * 显示侧边栏切换按钮、应用标题、语言切换器（EN/中文）、
 * 连接状态徽章和暗色模式切换。当没有活动连接时显示"连接"按钮。
 *
 * @file 应用标题栏，含语言切换器
 */
import { Group, Button, Text, SegmentedControl } from '@mantine/core'
import { IconMenu2, IconSun, IconMoon } from '@tabler/icons-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useConnectionStore } from '@/stores/connectionStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { StatusBadge } from '@/components/common/StatusBadge'

export function Header() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const activeStatuses = useConnectionStore((s) => s.activeStatuses)
  const currentId = useConnectionStore((s) => s.currentConnectionId)
  const switchConnection = useConnectionStore((s) => s.switchConnection)
  const darkMode = useSettingsStore((s) => s.darkMode)
  const toggleDarkMode = useSettingsStore((s) => s.toggleDarkMode)
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar)
  const language = useSettingsStore((s) => s.language)
  const setLanguage = useSettingsStore((s) => s.setLanguage)

  const currentStatus = currentId ? activeStatuses.get(currentId) : null

  return (
    <Group h="100%" px="md" justify="space-between" style={{ flexWrap: 'nowrap' }}>
      <Group gap="xs" style={{ flexWrap: 'nowrap' }}>
        <Button variant="subtle" size="compact-sm" onClick={toggleSidebar} px={4}>
          <IconMenu2 size={16} />
        </Button>
        <Text fw={600} size="sm">{t('app.title')}</Text>
      </Group>

      <Group gap="sm" style={{ flexWrap: 'nowrap' }}>
        <SegmentedControl
          size="xs"
          value={language}
          onChange={setLanguage}
          data={[
            { label: 'EN', value: 'en' },
            { label: '中文', value: 'zh' },
          ]}
        />
        {currentStatus && (
          <StatusBadge state={currentStatus.state} rttMs={currentStatus.rtt_ms} />
        )}
        {!currentId && (
          <Button size="compact-sm" variant="light" onClick={() => navigate('/connections')}>
            {t('nav.connections')}
          </Button>
        )}
      </Group>

      <Button variant="subtle" size="compact-sm" onClick={toggleDarkMode} px={4}>
        {darkMode ? <IconSun size={16} /> : <IconMoon size={16} />}
      </Button>
    </Group>
  )
}
