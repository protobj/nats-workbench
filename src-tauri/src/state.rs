//! 由Tauri管理的共享应用状态。

use crate::nats::connection::NatsConnection;
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::AppHandle;

/// 保存所有活跃NATS连接的全局状态，以配置ID为键。
pub struct AppState {
    pub connections: Arc<DashMap<String, NatsConnection>>,
    pub app_handle: AppHandle,
}

impl AppState {
    /// 创建一个带有空连接映射的新应用状态。
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            connections: Arc::new(DashMap::new()),
            app_handle,
        }
    }
}

/// NATS连接的生命周期状态。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ConnState {
    Disconnected,
    Connecting,
    Connected,
    Reconnecting,
    Closed,
}

impl std::fmt::Display for ConnState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConnState::Disconnected => write!(f, "disconnected"),
            ConnState::Connecting => write!(f, "connecting"),
            ConnState::Connected => write!(f, "connected"),
            ConnState::Reconnecting => write!(f, "reconnecting"),
            ConnState::Closed => write!(f, "closed"),
        }
    }
}

/// 用于UI连接列表的连接轻量快照。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionSummary {
    pub id: String,
    pub label: String,
    pub state: ConnState,
    pub server_addr: String,
    pub connected_at: Option<String>,
}
