/**
 * 连接状态徽章，带颜色编码和可选的脉冲动画。
 * 连接时显示以毫秒为单位的 RTT，或显示翻译后的状态标签。
 * 注入 CSS 关键帧以实现重连/高延迟脉冲效果。
 *
 * @file 连接状态徽章
 */
import { Badge } from '@mantine/core'
import { useTranslation } from 'react-i18next'

const styleId = 'status-badge-pulse'
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const s = document.createElement('style'); s.id = styleId
  s.textContent = `@keyframes statusPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`
  document.head.appendChild(s)
}

/** 连接状态徽章的属性。 */
interface Props { state: string; rttMs?: number }

export function StatusBadge({ state, rttMs }: Props) {
  const { t } = useTranslation()
  const colorMap: Record<string, string> = { connected: 'green', connecting: 'yellow', reconnecting: 'red', disconnected: 'gray', closed: 'gray' }
  const color = colorMap[state] || 'gray'
  const showPulse = state === 'reconnecting' || (state === 'connected' && rttMs !== undefined && rttMs > 5)
  const label = state === 'connected' && rttMs !== undefined ? `${rttMs.toFixed(1)}ms` : t(`common.${state === 'closed' ? 'disconnected' : state}`)

  return (
    <Badge color={color} variant="light" size="xs" leftSection={<span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: `var(--mantine-color-${color}-6)`, display: 'inline-block', animation: showPulse ? 'statusPulse 1.5s ease-in-out infinite' : undefined }} />}>
      {label}
    </Badge>
  )
}
