# NATS Workbench

基于 **Tauri v2** + **React** + **Mantine v7** 构建的跨平台桌面端 NATS 客户端。面向游戏服务器运维场景 — 统一管理连接、监控集群、浏览主题、调试消息、管理 JetStream。

[English](README.md)

## 功能特性

### 连接与会话管理
- 多环境连接配置保存/一键切换（开发/测试/生产）
- 6 种认证方式：无认证、Token、用户名密码、NKey、JWT+NKey、TLS 双向证书
- 连接池实时状态：RTT 延迟、收发速率、重连次数
- 延迟毛刺告警（RTT > 5ms 变色高亮）

### 服务器与集群监控
- 服务器概览：CPU、内存、客户端连接、订阅数、消息吞吐量
- 通过 $SYS 内省实时拉取服务器指标
- 慢消费者检测与待处理消息量
- JetStream 资源概览：流、消费者、存储占用

### 主题探索与消息调试
- 主题浏览器 — 通配符订阅自动发现活跃主题，构建树形视图
- 多主题实时消息监听器，虚拟滚动表格
- JSON 智能格式化，双击查看消息详情
- 消息发布器（支持 reply-to）
- 请求/响应（RPC）模拟器，支持超时配置

### JetStream 管理
- 流管理：创建、删除、清空、消息浏览、单条删除
- Pull 消费者管理：Ack 策略、交付策略、过滤器、流控
- 消费者状态面板：待确认、等待中、重投次数

### KV 与对象存储
- KV 浏览器：列举键、增删改查、实时 Watch 日志
- 对象存储浏览器：列表查看、上传、下载、删除
- 游戏场景适用：动态配置、服务发现、补丁分发

### 游戏服务器专项工具
- **房间拓扑** — 发现 `room.<id>.*` 下所有活跃主题，可视化发布/订阅关系
- **延迟压测** — 内置简易压力工具：可配置消息大小/速率/时长，输出 P50/P99 延迟
- **消息回放** — 从 JetStream 流读取历史消息，按需重放到目标主题

### 体验增强
- 暗色主题（默认），支持亮色切换
- 可折叠侧边栏
- 中英文一键切换，语言偏好持久化
- Zustand 状态管理

---

## 技术栈

| 层面 | 技术 |
|------|------|
| 框架 | [Tauri v2](https://v2.tauri.app)（Rust 后端 + WebView 前端） |
| NATS 客户端 | [async-nats](https://crates.io/crates/async-nats) 0.49 |
| UI 框架 | [React 18](https://react.dev) + TypeScript |
| 组件库 | [Mantine v7](https://mantine.dev) |
| 状态管理 | [Zustand](https://zustand-demo.pmnd.rs) |
| 国际化 | [react-i18next](https://react.i18next.com) |
| 图标 | [Tabler Icons](https://tabler.io/icons) |
| 构建 | [Vite](https://vitejs.dev) |

---

## 架构

```
前端 (React)                        后端 (Rust/Tauri)
┌─────────────────────┐  invoke()    ┌──────────────────────┐
│  Pages/Components    │ ◄──────────► │  Tauri Commands (65) │
│  Zustand Stores      │              │  ├─ connection_cmd   │
│  Mantine UI          │  listen()    │  ├─ topic_cmd       │
│  i18n (en/zh)        │ ◄─────────── │  ├─ monitor_cmd     │
└─────────────────────┘   events      │  ├─ jetstream_cmd   │
                                      │  ├─ game_cmd        │
                                      │  ├─ kv_cmd          │
                                      │  └─ object_cmd      │
                                      │                     │
                                      │  NatsConnection 池  │
                                      │  async-nats Client  │
                                      └──────────┬──────────┘
                                                 │
                                             NATS Server(s)
```

- 所有 NATS 操作在 Rust 侧通过 `async-nats` 执行
- 实时数据（状态更新、消息推送、KV 变更）通过 Tauri `emit()` 推送到前端
- 前端通过 `listen()` 接收事件，更新 Zustand store
- 连接配置通过 `tauri-plugin-store` 持久化到本地

---

## 项目结构

```
nats-workbench/
├── src/                          # React 前端
│   ├── main.tsx                  # 入口
│   ├── App.tsx                   # MantineProvider + AppShell
│   ├── AppRoutes.tsx             # 10 条路由
│   ├── types/index.ts            # 共享 TypeScript 类型
│   ├── stores/                   # Zustand stores
│   │   ├── connectionStore.ts    # 连接配置 + 连接池状态
│   │   ├── settingsStore.ts      # 暗色模式/语言/侧边栏
│   │   ├── topicStore.ts         # 订阅 + 主题发现
│   │   └── messageStore.ts       # 消息缓冲区
│   ├── i18n/
│   │   ├── index.ts              # i18next 初始化
│   │   └── locales/{en,zh}.json  # 各 130+ key
│   ├── pages/                    # 11 个页面
│   │   ├── DashboardPage.tsx     # 连接概览
│   │   ├── ConnectionsPage.tsx   # 配置管理
│   │   ├── MonitorPage.tsx       # 服务器监控
│   │   ├── TopicsPage.tsx        # 主题浏览器
│   │   ├── MessagesPage.tsx      # 监听/发布/RPC
│   │   ├── JetStreamPage.tsx     # 流与消息管理
│   │   ├── KvStorePage.tsx       # KV 浏览器 + Watch
│   │   ├── ObjectStorePage.tsx   # 对象上传/下载
│   │   ├── BenchmarkPage.tsx     # 延迟压测
│   │   ├── ReplayPage.tsx        # 消息回放
│   │   └── RoomTopologyPage.tsx  # 房间拓扑
│   └── components/
│       ├── layout/
│       │   ├── Header.tsx        # 语言切换 + 连接选择
│       │   └── Navbar.tsx        # 侧边栏导航
│       └── common/
│           ├── ConnectionForm.tsx # 6 种认证配置表单
│           ├── StatusBadge.tsx    # 连接状态指示器
│           ├── MessageTable.tsx   # 虚拟滚动消息表格
│           ├── SubjectTree.tsx    # 主题 Trie → 树形视图
│           ├── TopicInput.tsx     # 主题自动补全输入框
│           └── PayloadEditor.tsx  # Text/JSON 编辑器
│
├── src-tauri/                    # Rust 后端
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs
│       ├── lib.rs                # Tauri Builder，注册 65 个命令
│       ├── error.rs              # AppError 枚举
│       ├── state.rs              # AppState（连接池）
│       ├── nats/
│       │   ├── config.rs         # 数据模型 + 认证类型
│       │   ├── auth.rs           # ConnectOptions 构建器
│       │   ├── connection.rs     # NatsConnection + 后台监控
│       │   └── message.rs        # NatsMessageEvent 序列化
│       └── commands/
│           ├── connection_cmd.rs  # 10 命令
│           ├── topic_cmd.rs       # 5 命令
│           ├── monitor_cmd.rs     # 3 命令
│           ├── jetstream_cmd.rs   # 9 命令
│           ├── game_cmd.rs        # 3 命令
│           ├── kv_cmd.rs          # 6 命令
│           └── object_cmd.rs      # 5 命令
│
├── package.json
├── tsconfig.json
├── vite.config.ts
└── index.html
```

---

## Rust 命令一览

| 模块 | 命令 | 说明 |
|------|------|------|
| **connection** | `list_configs` | 列出所有连接配置 |
| | `save_config` | 保存/更新连接配置 |
| | `delete_config` | 删除配置 |
| | `export_config` | 导出配置为 JSON |
| | `import_config` | 从 JSON 导入配置 |
| | `connect` | 建立 NATS 连接 |
| | `disconnect` | 断开连接 |
| | `get_status` | 获取实时连接状态 |
| | `list_active_connections` | 列出所有活跃连接 |
| | `test_connection` | 测试连接（不保存） |
| **topic** | `subscribe` | 订阅主题（返回 sub_id） |
| | `unsubscribe` | 取消订阅 |
| | `publish` | 发布消息 |
| | `send_request` | NATS 请求-响应（带超时） |
| | `discover_subjects` | 短暂订阅 `>` 收集活跃主题 |
| **monitor** | `fetch_server_stats` | $SYS VARZ — CPU/内存/连接数 |
| | `fetch_slow_consumers` | $SYS CONNZ — 慢消费者列表 |
| | `fetch_jetstream_summary` | $SYS JSZ — JetStream 概览 |
| **jetstream** | `list_streams` | 列出所有流 |
| | `create_stream` | 创建流 |
| | `delete_stream` | 删除流 |
| | `purge_stream` | 清空流内消息 |
| | `stream_messages` | 按序号范围获取消息 |
| | `delete_stream_message` | 按序号删除单条消息 |
| | `list_consumers` | 列出流的消费者 |
| | `create_consumer` | 创建 Pull 消费者 |
| | `delete_consumer` | 删除消费者 |
| **game** | `discover_room_topics` | 发现 `room.<id>.*` 主题 |
| | `run_benchmark` | 运行延迟/吞吐量压测 |
| | `replay_stream_messages` | 流消息回放到目标主题 |
| **kv** | `list_kv_stores` | 列出 KV 存储桶 |
| | `kv_get_keys` | 列出桶内所有键 |
| | `kv_get` | 按键获取值 |
| | `kv_put` | 写入/更新键值 |
| | `kv_delete` | 删除键 |
| | `kv_watch` | 监听 KV 桶变更 |
| **object** | `list_object_stores` | 列出对象存储桶 |
| | `list_objects` | 列出桶内对象 |
| | `obj_get` | 下载对象内容 |
| | `obj_put` | 上传对象 |
| | `obj_delete` | 删除对象 |

---

## 快速开始

### 环境要求

- [Rust](https://rustup.rs) 1.70+ 及 `cargo`
- [Node.js](https://nodejs.org) 18+ 及 `npm`
- [Tauri 系统依赖](https://v2.tauri.app/start/prerequisites/)（Linux: `libwebkit2gtk-4.1-dev`、`libgtk-3-dev` 等）

### 安装运行

```bash
git clone https://github.com/<your-org>/nats-workbench.git
cd nats-workbench

# 安装前端依赖
npm install

# 启动开发模式（前后端热重载）
npm run tauri dev

# 构建生产版本
npm run tauri build
```

### 快速体验

1. 启动本地 NATS 服务：`docker run -p 4222:4222 nats -js`
2. 启动应用：`npm run tauri dev`
3. 点击侧边栏 **连接管理** → **新建连接**
4. 填写 `nats://localhost:4222` → **保存并连接**
5. 浏览主题、发布消息、创建流

---

## License

MIT
