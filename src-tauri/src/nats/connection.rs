//! 围绕`async_nats::Client`的核心连接包装器，带统计和监控功能。

use crate::error::AppError;
use crate::nats::auth::build_connect_options;
use crate::nats::config::{ConnectionConfig, ConnectionStatus};
use crate::state::ConnState;
use dashmap::DashMap;
use log::{info, warn, error};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

/// 管理单个NATS连接、其配置、活跃订阅、统计数据和监控任务。
pub struct NatsConnection {
    pub config: ConnectionConfig,
    pub client: Option<async_nats::Client>,
    pub stats: Arc<ConnectionStats>,
    pub monitor_handle: Mutex<Option<JoinHandle<()>>>,
    pub connected_at: Mutex<Option<chrono::DateTime<chrono::Utc>>>,
    pub subscriptions: Arc<DashMap<String, JoinHandle<()>>>,
}

/// 连接流量和状态的原子计数器及元数据。
pub struct ConnectionStats {
    pub msgs_in: AtomicU64,
    pub msgs_out: AtomicU64,
    pub bytes_in: AtomicU64,
    pub bytes_out: AtomicU64,
    pub reconnect_count: AtomicU64,
    pub rtt_ns: AtomicU64,
    pub subscriptions_count: AtomicU64,
    pub state: Mutex<ConnState>,
    pub server_addr: Mutex<String>,
    pub server_version: Mutex<String>,
}

impl ConnectionStats {
    /// 将所有计数器初始化为零，状态设为`Disconnected`。
    pub fn new() -> Self {
        Self {
            msgs_in: AtomicU64::new(0),
            msgs_out: AtomicU64::new(0),
            bytes_in: AtomicU64::new(0),
            bytes_out: AtomicU64::new(0),
            reconnect_count: AtomicU64::new(0),
            rtt_ns: AtomicU64::new(0),
            subscriptions_count: AtomicU64::new(0),
            state: Mutex::new(ConnState::Disconnected),
            server_addr: Mutex::new(String::new()),
            server_version: Mutex::new(String::new()),
        }
    }
}

impl NatsConnection {
    /// 使用给定配置创建一个新的未连接的`NatsConnection`。
    pub fn new(config: ConnectionConfig) -> Self {
        Self {
            config,
            client: None,
            stats: Arc::new(ConnectionStats::new()),
            monitor_handle: Mutex::new(None),
            connected_at: Mutex::new(None),
            subscriptions: Arc::new(DashMap::new()),
        }
    }

    /// 使用存储的配置打开NATS连接并更新内部状态。
    pub async fn connect(&mut self) -> Result<(), AppError> {
        *self.stats.state.lock().await = ConnState::Connecting;

        let options = build_connect_options(&self.config)?;
        let servers: Vec<String> = self.config.servers.clone();
        let server_strs: Vec<&str> = servers.iter().map(|s| s.as_str()).collect();

        info!("Connecting to {}", servers.join(","));

        let client = async_nats::connect_with_options(&server_strs, options)
            .await
            .map_err(|e| {
                error!("Connect failed: {}", e);
                AppError::Connection(format!("Failed to connect: {}", e))
            })?;

        let addr = server_strs.first().unwrap_or(&"").to_string();
        info!("Connected to {}", addr);
        *self.stats.server_addr.lock().await = addr.clone();
        *self.stats.server_version.lock().await = addr.clone();
        *self.stats.state.lock().await = ConnState::Connected;
        *self.connected_at.lock().await = Some(chrono::Utc::now());

        self.client = Some(client);
        Ok(())
    }

    /// 优雅地停止监控器，中止所有订阅并丢弃NATS客户端。
    pub async fn disconnect(&mut self) -> Result<(), AppError> {
        info!("Disconnecting");
        let mut handle = self.monitor_handle.lock().await;
        if let Some(h) = handle.take() {
            h.abort();
        }
        drop(handle);

        for entry in self.subscriptions.iter() {
            entry.value().abort();
        }
        self.subscriptions.clear();

        self.client = None;
        *self.stats.state.lock().await = ConnState::Closed;
        Ok(())
    }

    /// 返回连接遥测的即时快照。
    pub async fn get_status(&self, _app_handle: &tauri::AppHandle, conn_id: &str) -> ConnectionStatus {
        let state = self.stats.state.lock().await.clone();
        let server_addr = self.stats.server_addr.lock().await.clone();
        let server_version = self.stats.server_version.lock().await.clone();
        let reconnect_count = self.stats.reconnect_count.load(Ordering::Relaxed);
        let rtt_ns = self.stats.rtt_ns.load(Ordering::Relaxed);
        let subscriptions_count = self.stats.subscriptions_count.load(Ordering::Relaxed);

        ConnectionStatus {
            id: conn_id.to_string(),
            label: self.config.label.clone(),
            state: state.to_string(),
            rtt_ms: rtt_ns as f64 / 1_000_000.0,
            server_addr,
            server_version,
            msgs_in_per_sec: 0.0,
            msgs_out_per_sec: 0.0,
            bytes_in_per_sec: 0.0,
            bytes_out_per_sec: 0.0,
            reconnect_count: reconnect_count as u32,
            uptime_secs: 0,
            subscriptions_count,
        }
    }

    /// 生成一个后台任务，每秒发送`nats-status-update`事件。
    pub async fn start_monitor(&self, app_handle: tauri::AppHandle, conn_id: String) {
        let stats = self.stats.clone();
        let cid = conn_id.clone();

        info!("Monitor started for {}", conn_id);

        let handle = tokio::spawn(async move {
            let mut prev_msgs_in: u64 = 0;
            let mut prev_msgs_out: u64 = 0;
            let mut prev_bytes_in: u64 = 0;
            let mut prev_bytes_out: u64 = 0;

            loop {
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;

                let current_state = stats.state.lock().await.clone();
                if current_state == ConnState::Closed {
                    warn!("Monitor stopped for {}", cid);
                    break;
                }

                let msgs_in = stats.msgs_in.load(Ordering::Relaxed);
                let msgs_out = stats.msgs_out.load(Ordering::Relaxed);
                let bytes_in = stats.bytes_in.load(Ordering::Relaxed);
                let bytes_out = stats.bytes_out.load(Ordering::Relaxed);

                let msgs_in_rate = if msgs_in >= prev_msgs_in { msgs_in - prev_msgs_in } else { 0 } as f64;
                let msgs_out_rate = if msgs_out >= prev_msgs_out { msgs_out - prev_msgs_out } else { 0 } as f64;
                let bytes_in_rate = if bytes_in >= prev_bytes_in { bytes_in - prev_bytes_in } else { 0 } as f64;
                let bytes_out_rate = if bytes_out >= prev_bytes_out { bytes_out - prev_bytes_out } else { 0 } as f64;

                prev_msgs_in = msgs_in;
                prev_msgs_out = msgs_out;
                prev_bytes_in = bytes_in;
                prev_bytes_out = bytes_out;

                let server_addr = stats.server_addr.lock().await.clone();
                let server_version = stats.server_version.lock().await.clone();
                let reconnect_count = stats.reconnect_count.load(Ordering::Relaxed);
                let rtt_ns = stats.rtt_ns.load(Ordering::Relaxed);
                let subscriptions_count = stats.subscriptions_count.load(Ordering::Relaxed);

                let status = ConnectionStatus {
                    id: cid.clone(),
                    label: String::new(),
                    state: current_state.to_string(),
                    rtt_ms: rtt_ns as f64 / 1_000_000.0,
                    server_addr,
                    server_version,
                    msgs_in_per_sec: msgs_in_rate,
                    msgs_out_per_sec: msgs_out_rate,
                    bytes_in_per_sec: bytes_in_rate,
                    bytes_out_per_sec: bytes_out_rate,
                    reconnect_count: reconnect_count as u32,
                    uptime_secs: 0,
                    subscriptions_count,
                };

                let _ = app_handle.emit("nats-status-update", &status);
            }
        });

        *self.monitor_handle.lock().await = Some(handle);
    }
}
