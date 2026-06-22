/**
 * 侧边栏导航组件。
 * 渲染带图标和标签的分类导航链接（主页、工具、游戏工具、KV）。
 * 切换侧边栏时折叠为仅图标加提示。
 *
 * @file 侧边栏导航
 */
import { NavLink, Tooltip, Stack, Divider } from '@mantine/core'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settingsStore'
import {
  IconDashboard, IconPlugConnected, IconSearch,
  IconChartBar, IconCloud, IconArchive,
  IconFolder, IconDeviceGamepad2,
  IconGauge, IconHistory, IconTopologyStar3,
} from '@tabler/icons-react'

export function Navbar() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const collapsed = useSettingsStore((s) => s.sidebarCollapsed)

  const mainLinks = [
    { label: t('nav.dashboard'), to: '/', icon: IconDashboard },
    { label: t('nav.connections'), to: '/connections', icon: IconPlugConnected },
  ]

  const toolLinks = [
    { label: t('nav.monitor'), to: '/monitor', icon: IconChartBar },
    { label: t('nav.jetstream'), to: '/jetstream', icon: IconArchive },
    { label: t('nav.topics'), to: '/topics', icon: IconSearch },
    { label: t('nav.messages'), to: '/messages', icon: IconCloud },
  ]

  const kvLinks = [
    { label: t('nav.kvStore'), to: '/kv', icon: IconFolder },
    { label: t('nav.objectStore'), to: '/objects', icon: IconArchive },
  ]

  const gameLinks = [
    { label: t('nav.benchmark'), to: '/benchmark', icon: IconGauge },
    { label: t('nav.replay'), to: '/replay', icon: IconHistory },
    { label: t('nav.roomTopology'), to: '/room-topology', icon: IconTopologyStar3 },
  ]

  const disabledLinks: { label: string; to: string; icon: any }[] = []

  function renderLink(link: { label: string; to: string; icon: any }, disabled = false) {
    if (collapsed) {
      return (
        <Tooltip key={link.to} label={link.label} position="right">
          <NavLink leftSection={<link.icon size={18} />} active={location.pathname === link.to} disabled={disabled} onClick={disabled ? undefined : () => navigate(link.to)} />
        </Tooltip>
      )
    }
    return (
      <NavLink key={link.to} label={link.label} leftSection={<link.icon size={18} />} active={location.pathname === link.to} disabled={disabled} onClick={disabled ? undefined : () => navigate(link.to)} />
    )
  }

  return (
    <Stack gap={0} p={collapsed ? 4 : 'xs'}>
      {mainLinks.map((l) => renderLink(l))}
      <Divider my={4} />
      {toolLinks.map((l) => renderLink(l))}
      <Divider my={4} />
      {collapsed ? (
        <Tooltip label={t('nav.gameTools')} position="right">
          <NavLink leftSection={<IconDeviceGamepad2 size={18} />} defaultOpened={false} childrenOffset={0}>
            {gameLinks.map((l) => renderLink(l))}
          </NavLink>
        </Tooltip>
      ) : (
        <NavLink label={t('nav.gameTools')} leftSection={<IconDeviceGamepad2 size={18} />} defaultOpened={false} childrenOffset={16}>
          {gameLinks.map((l) => renderLink(l))}
        </NavLink>
      )}
      <Divider my={4} />
      {kvLinks.map((l) => renderLink(l))}
      {disabledLinks.map((l) => renderLink(l, true))}
    </Stack>
  )
}
