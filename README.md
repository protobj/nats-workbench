# NATS Workbench

A cross-platform desktop GUI client for [NATS](https://nats.io), built with **Tauri v2** + **React** + **Mantine v7**. Designed for game server operations — manage connections, monitor clusters, explore topics, debug messages, and administer JetStream, all from one tool.

[中文文档](README_zh.md)

## Features

### Connection & Session Management
- Save multiple connection configs (dev/staging/prod) with one-click switching
- 6 authentication methods: None, Token, Username/Password, NKey, JWT+NKey, TLS (mTLS)
- Connection pool with real-time status: RTT, throughput, reconnect count
- RTT > 5ms visual warning for latency-sensitive game workloads

### Server & Cluster Monitoring
- Server overview: CPU, memory, connections, subscriptions, message throughput
- $SYS introspection for real-time server stats
- Slow consumer detection with pending message counts
- JetStream resource overview: streams, consumers, storage

### Topic Explorer & Message Debugging
- Subject tree browser — auto-discover topics with wildcard subscription
- Multi-subject real-time message listener with virtual-scroll table
- JSON-aware payload viewer with double-click detail modal
- Message publisher with reply-to support
- Request/Reply (RPC) simulator with timeout configuration

### JetStream Management
- Stream CRUD: create, edit, delete, purge, browse messages, delete single messages
- Pull consumer CRUD: Ack policy, deliver policy, filter subjects, flow control
- Consumer status panel: pending, waiting, redelivered counts

### KV & Object Store
- Key-Value browser: list keys, get/put/delete, real-time Watch log
- Object Store browser: list, upload, view, download, delete objects
- Game-ready: dynamic config, service discovery, patch distribution

### Game Server Tools
- **Room Topology** — discover `room.<id>.*` topics and visualize pub/sub relationships
- **Benchmark** — built-in stress test: configurable payload size, rate, duration; P50/P99 latency reporting
- **Message Replay** — replay JetStream stream messages to target subjects for downstream testing

### UX
- Dark theme by default (light toggle)
- Collapsible sidebar
- EN / 中文 language switcher with persistence
- Zustand state management

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Tauri v2](https://v2.tauri.app) (Rust backend + WebView frontend) |
| NATS Client | [async-nats](https://crates.io/crates/async-nats) 0.49 |
| UI Framework | [React 18](https://react.dev) + TypeScript |
| Component Library | [Mantine v7](https://mantine.dev) |
| State Management | [Zustand](https://zustand-demo.pmnd.rs) |
| i18n | [react-i18next](https://react.i18next.com) |
| Icons | [Tabler Icons](https://tabler.io/icons) |
| Build | [Vite](https://vitejs.dev) |

---

## Architecture

```
Frontend (React)                    Backend (Rust/Tauri)
┌─────────────────────┐    invoke()    ┌──────────────────────┐
│  Pages/Components   │ ◄──────────► │  Tauri Commands (65)  │
│  Zustand Stores     │               │  ├─ connection_cmd    │
│  Mantine UI         │   listen()     │  ├─ topic_cmd        │
│  i18n (en/zh)       │ ◄─────────── │  ├─ monitor_cmd      │
└─────────────────────┘    events      │  ├─ jetstream_cmd    │
                                       │  ├─ game_cmd         │
                                       │  ├─ kv_cmd           │
                                       │  └─ object_cmd       │
                                       │                      │
                                       │  NatsConnection Pool │
                                       │  async-nats Client   │
                                       └──────────┬───────────┘
                                                  │
                                              NATS Server(s)
```

- All NATS operations run in Rust via `async-nats`
- Real-time data (status updates, messages, KV watch) pushed via Tauri `emit()` events
- Frontend receives events via `listen()` and updates Zustand stores
- Connection configs persist via `tauri-plugin-store`

---

## Project Structure

```
nats-workbench/
├── src/                          # React frontend
│   ├── main.tsx                  # Entry point
│   ├── App.tsx                   # MantineProvider + AppShell
│   ├── AppRoutes.tsx             # 10 routes
│   ├── types/index.ts            # Shared TypeScript types
│   ├── stores/                   # Zustand stores
│   │   ├── connectionStore.ts    # Connection config + pool state
│   │   ├── settingsStore.ts      # Dark mode, language, sidebar
│   │   ├── topicStore.ts         # Subscriptions + discovery
│   │   └── messageStore.ts       # Message buffer
│   ├── i18n/
│   │   ├── index.ts              # i18next init
│   │   └── locales/{en,zh}.json  # 130+ translation keys each
│   ├── pages/                    # 10 pages
│   │   ├── DashboardPage.tsx     # Connection overview
│   │   ├── ConnectionsPage.tsx   # Config CRUD
│   │   ├── MonitorPage.tsx       # Server monitoring
│   │   ├── TopicsPage.tsx        # Subject browser
│   │   ├── MessagesPage.tsx      # Listen/Publish/RPC
│   │   ├── JetStreamPage.tsx     # Stream + message management
│   │   ├── KvStorePage.tsx       # KV browser + Watch
│   │   ├── ObjectStorePage.tsx   # Object upload/download
│   │   ├── BenchmarkPage.tsx     # Latency stress test
│   │   ├── ReplayPage.tsx        # Stream message replay
│   │   └── RoomTopologyPage.tsx  # Room topic discovery
│   └── components/
│       ├── layout/
│       │   ├── Header.tsx        # Lang switcher + conn selector
│       │   └── Navbar.tsx        # Sidebar navigation
│       └── common/
│           ├── ConnectionForm.tsx # 6 auth types config form
│           ├── StatusBadge.tsx    # Connection state indicator
│           ├── MessageTable.tsx   # Virtual-scroll message list
│           ├── SubjectTree.tsx    # Topic trie → tree view
│           ├── TopicInput.tsx     # Autocomplete subject input
│           └── PayloadEditor.tsx  # Text/JSON editor
│
├── src-tauri/                    # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs               # Entry point
│       ├── lib.rs                # Tauri Builder (65 commands)
│       ├── error.rs              # AppError enum
│       ├── state.rs              # AppState (connection pool)
│       ├── nats/
│       │   ├── config.rs         # Data models + auth types
│       │   ├── auth.rs           # ConnectOptions builder
│       │   ├── connection.rs     # NatsConnection + monitor
│       │   └── message.rs        # NatsMessageEvent serialization
│       └── commands/
│           ├── connection_cmd.rs  # 10 commands
│           ├── topic_cmd.rs       # 5 commands
│           ├── monitor_cmd.rs     # 3 commands
│           ├── jetstream_cmd.rs   # 9 commands
│           ├── game_cmd.rs        # 3 commands
│           ├── kv_cmd.rs          # 6 commands
│           └── object_cmd.rs      # 5 commands
│
├── package.json
├── tsconfig.json
├── vite.config.ts
└── index.html
```

---

## Rust Commands Reference

| Module | Command | Description |
|--------|---------|-------------|
| **connection** | `list_configs` | List saved connection configs |
| | `save_config` | Save/update a connection config |
| | `delete_config` | Remove a config |
| | `export_config` | Export config as JSON |
| | `import_config` | Import config from JSON |
| | `connect` | Open NATS connection |
| | `disconnect` | Close connection |
| | `get_status` | Get live connection status |
| | `list_active_connections` | List all active connections |
| | `test_connection` | Test a config without saving |
| **topic** | `subscribe` | Subscribe to subject (returns sub_id) |
| | `unsubscribe` | Cancel a subscription |
| | `publish` | Publish message to subject |
| | `send_request` | NATS request-reply with timeout |
| | `discover_subjects` | Subscribe to `>` briefly to collect subjects |
| **monitor** | `fetch_server_stats` | $SYS VARZ — CPU, memory, connections |
| | `fetch_slow_consumers` | $SYS CONNZ — slow consumer list |
| | `fetch_jetstream_summary` | $SYS JSZ — JetStream overview |
| **jetstream** | `list_streams` | List all JetStream streams |
| | `create_stream` | Create a stream with config |
| | `delete_stream` | Delete a stream |
| | `purge_stream` | Purge all messages in stream |
| | `stream_messages` | Fetch messages by sequence range |
| | `delete_stream_message` | Delete single message by seq |
| | `list_consumers` | List consumers of a stream |
| | `create_consumer` | Create pull consumer |
| | `delete_consumer` | Delete consumer |
| **game** | `discover_room_topics` | Discover `room.<id>.*` topics |
| | `run_benchmark` | Run latency/throughput stress test |
| | `replay_stream_messages` | Replay stream messages to target |
| **kv** | `list_kv_stores` | List KV stores |
| | `kv_get_keys` | List all keys in a bucket |
| | `kv_get` | Get value by key |
| | `kv_put` | Put/update key-value |
| | `kv_delete` | Delete key |
| | `kv_watch` | Watch KV bucket for changes |
| **object** | `list_object_stores` | List object store buckets |
| | `list_objects` | List objects in a bucket |
| | `obj_get` | Download object content |
| | `obj_put` | Upload object |
| | `obj_delete` | Delete object |

---

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs) 1.70+ with `cargo`
- [Node.js](https://nodejs.org) 18+ with `npm`
- [Tauri system dependencies](https://v2.tauri.app/start/prerequisites/) (Linux: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, etc.)

### Install & Run

```bash
# Clone the repository
git clone https://github.com/<your-org>/nats-workbench.git
cd nats-workbench

# Install frontend dependencies
npm install

# Start development mode (hot reload for both frontend and Rust)
npm run tauri dev

# Build for production
npm run tauri build
```

### Quick Test

1. Start a local NATS server: `docker run -p 4222:4222 nats -js`
2. Launch `npm run tauri dev`
3. Navigate to **Connections** → **New Connection**
4. Fill in `nats://localhost:4222` → **Save & Connect**
5. Explore topics, publish messages, create streams

---

## License

MIT
