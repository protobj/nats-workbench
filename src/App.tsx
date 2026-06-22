/**
 * 应用根组件。
 * 使用 MantineProvider（主题、暗色模式）、Notifications、
 * BrowserRouter 和 AppShell 布局包裹应用。挂载时初始化设置、
 * 连接和监听器。
 *
 * @file 根应用，包含 MantineProvider、AppShell、初始化
 */
import { MantineProvider, AppShell, createTheme } from '@mantine/core'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import { Notifications } from '@mantine/notifications'
import { BrowserRouter } from 'react-router-dom'
import { useEffect } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useConnectionStore } from '@/stores/connectionStore'
import { useMessageStore } from '@/stores/messageStore'
import { AppRoutes } from './AppRoutes'
import { Header } from '@/components/layout/Header'
import { Navbar } from '@/components/layout/Navbar'

const theme = createTheme({
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  primaryColor: 'blue',
  defaultRadius: 'sm',
})

export default function App() {
  const darkMode = useSettingsStore((s) => s.darkMode)
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed)
  const initSettings = useSettingsStore((s) => s.init)
  const loadConfigs = useConnectionStore((s) => s.loadConfigs)
  const refreshConnections = useConnectionStore((s) => s.refreshActiveConnections)
  const startStatusListener = useConnectionStore((s) => s.startStatusListener)
  const startMsgListener = useMessageStore((s) => s.startListener)

  useEffect(() => {
    initSettings().then(async () => {
      await loadConfigs()
      await refreshConnections()
      await startStatusListener()
      await startMsgListener()
    })
  }, [])

  return (
    <MantineProvider theme={theme} forceColorScheme={darkMode ? 'dark' : 'light'}>
      <Notifications position="top-right" />
      <BrowserRouter>
        <AppShell
          header={{ height: 40 }}
          navbar={{ width: sidebarCollapsed ? 56 : 220, breakpoint: 0 }}
          padding={0}
        >
          <AppShell.Header>
            <Header />
          </AppShell.Header>
          <AppShell.Navbar>
            <Navbar />
          </AppShell.Navbar>
          <AppShell.Main style={{ display: 'flex', flexDirection: 'column' }}>
            <AppRoutes />
          </AppShell.Main>
        </AppShell>
      </BrowserRouter>
    </MantineProvider>
  )
}
