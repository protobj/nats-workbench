/**
 * 应用路由定义。
 * 将 URL 路径映射到 NATS GUI 仪表板的页面组件，
 * 包括连接、主题、消息、监控、JetStream、
 * 基准测试、回放、房间拓扑、KV 存储和对象存储页面。
 *
 * @file 路由定义
 */
import { Routes, Route } from 'react-router-dom'
import { DashboardPage } from '@/pages/DashboardPage'
import { ConnectionsPage } from '@/pages/ConnectionsPage'
import { TopicsPage } from '@/pages/TopicsPage'
import { MessagesPage } from '@/pages/MessagesPage'
import { MonitorPage } from '@/pages/MonitorPage'
import { JetStreamPage } from '@/pages/JetStreamPage'
import { BenchmarkPage } from '@/pages/BenchmarkPage'
import { ReplayPage } from '@/pages/ReplayPage'
import { RoomTopologyPage } from '@/pages/RoomTopologyPage'
import { KvStorePage } from '@/pages/KvStorePage'
import { ObjectStorePage } from '@/pages/ObjectStorePage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/connections" element={<ConnectionsPage />} />
      <Route path="/topics" element={<TopicsPage />} />
      <Route path="/messages" element={<MessagesPage />} />
      <Route path="/monitor" element={<MonitorPage />} />
      <Route path="/jetstream" element={<JetStreamPage />} />
      <Route path="/benchmark" element={<BenchmarkPage />} />
      <Route path="/replay" element={<ReplayPage />} />
      <Route path="/room-topology" element={<RoomTopologyPage />} />
      <Route path="/kv" element={<KvStorePage />} />
      <Route path="/objects" element={<ObjectStorePage />} />
    </Routes>
  )
}
