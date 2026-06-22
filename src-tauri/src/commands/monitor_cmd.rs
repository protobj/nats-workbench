//! 监控服务器状态、慢消费者和 JetStream 摘要的命令。

use crate::error::AppError;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

/// 来自 NATS 服务器 VARZ 端点的聚合服务器统计信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerStats {
    pub server_id: String,
    pub server_name: String,
    pub version: String,
    pub uptime: String,
    pub cpu_percent: f64,
    pub memory_mb: u64,
    pub total_memory_mb: u64,
    pub connections: u64,
    pub subscriptions: u64,
    pub messages_in: u64,
    pub messages_out: u64,
    pub bytes_in: u64,
    pub bytes_out: u64,
    pub slow_consumers: u64,
    pub jetstream_enabled: bool,
}

/// 连接到 NATS 服务器的慢消费者信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlowConsumer {
    pub client_id: String,
    pub name: String,
    pub addr: String,
    pub pending: u64,
    pub subscriptions: Vec<String>,
}

/// JetStream 使用情况的摘要，包括流、消费者、消息和存储。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JetStreamSummary {
    pub streams: u64,
    pub consumers: u64,
    pub messages: u64,
    pub bytes: u64,
    pub pending: u64,
    pub storage_types: HashMap<String, u64>,
}

/// JetStream 流的信息（用于监控视图）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamInfo {
    pub name: String,
    pub subjects: Vec<String>,
    pub messages: u64,
    pub consumers: u64,
    pub retention: String,
    pub storage: String,
    pub max_bytes: i64,
    pub max_msgs: i64,
    pub max_age: String,
    pub replicas: u32,
    pub state: String,
}

/// JetStream 消费者的信息（用于监控视图）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsumerInfo {
    pub name: String,
    pub stream: String,
    pub durable: bool,
    pub push_mode: bool,
    pub ack_policy: String,
    pub deliver_policy: String,
    pub unprocessed: u64,
    pub ack_pending: u64,
    pub redelivered: u64,
    pub waiting: u64,
}

/// 通过 NATS 系统 VARZ 请求获取实时服务器统计信息。
#[tauri::command]
pub async fn fetch_server_stats(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<ServerStats, AppError> {
    let conn = state
        .connections
        .get(&connection_id)
        .ok_or_else(|| AppError::ConnectionNotFound(connection_id.clone()))?;

    let client = conn
        .client
        .clone()
        .ok_or_else(|| AppError::Connection("Not connected".into()))?;

    let varz_raw = client
        .request("$SYS.REQ.SERVER.PING.VARZ".to_string(), "".into())
        .await
        .map(|r| String::from_utf8_lossy(&r.payload).to_string())
        .unwrap_or_default();

    let mut stats = ServerStats {
        server_id: String::new(),
        server_name: String::new(),
        version: String::new(),
        uptime: String::new(),
        cpu_percent: 0.0,
        memory_mb: 0,
        total_memory_mb: 0,
        connections: 0,
        subscriptions: 0,
        messages_in: 0,
        messages_out: 0,
        bytes_in: 0,
        bytes_out: 0,
        slow_consumers: 0,
        jetstream_enabled: false,
    };

    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&varz_raw) {
        stats.server_id = json["server_id"].as_str().unwrap_or("").to_string();
        stats.server_name = json["server_name"].as_str().unwrap_or("").to_string();
        stats.version = json["version"].as_str().unwrap_or("").to_string();
        stats.uptime = json["uptime"].as_str().unwrap_or("").to_string();
        stats.cpu_percent = json["cpu"].as_f64().unwrap_or(0.0);
        stats.memory_mb = json["mem"].as_u64().unwrap_or(0) / (1024 * 1024);
        stats.connections = json["connections"].as_u64().unwrap_or(0);
        stats.subscriptions = json["subscriptions"].as_u64().unwrap_or(0);
        stats.slow_consumers = json["slow_consumers"].as_u64().unwrap_or(0);

        if let Some(in_msgs) = json["in_msgs"].as_u64() {
            stats.messages_in = in_msgs;
        }
        if let Some(out_msgs) = json["out_msgs"].as_u64() {
            stats.messages_out = out_msgs;
        }
        if let Some(in_bytes) = json["in_bytes"].as_u64() {
            stats.bytes_in = in_bytes;
        }
        if let Some(out_bytes) = json["out_bytes"].as_u64() {
            stats.bytes_out = out_bytes;
        }
        stats.jetstream_enabled = json["jetstream"].as_object().is_some();
    }

    Ok(stats)
}

/// 通过 NATS 系统 CONNZ 请求获取慢消费者列表。
#[tauri::command]
pub async fn fetch_slow_consumers(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<Vec<SlowConsumer>, AppError> {
    let conn = state
        .connections
        .get(&connection_id)
        .ok_or_else(|| AppError::ConnectionNotFound(connection_id.clone()))?;

    let client = conn
        .client
        .clone()
        .ok_or_else(|| AppError::Connection("Not connected".into()))?;

    let connz_raw = client
        .request("$SYS.REQ.SERVER.PING.CONNZ".to_string(), "".into())
        .await
        .map(|r| String::from_utf8_lossy(&r.payload).to_string())
        .unwrap_or_default();

    let mut consumers = Vec::new();

    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&connz_raw) {
        if let Some(conns) = json["connections"].as_array() {
            for c in conns {
                let pending = c["pending"].as_u64().unwrap_or(0);
                if pending > 0 || c["subscriptions_list"].as_array().map(|a| a.len()).unwrap_or(0) > 0 {
                    let subs: Vec<String> = c["subscriptions_list"]
                        .as_array()
                        .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                        .unwrap_or_default();

                    consumers.push(SlowConsumer {
                        client_id: c["cid"].as_u64().unwrap_or(0).to_string(),
                        name: c["name"].as_str().unwrap_or("").to_string(),
                        addr: c["ip"].as_str().unwrap_or("").to_string(),
                        pending,
                        subscriptions: subs,
                    });
                }
            }
        }
    }

    consumers.sort_by_key(|c| -(c.pending as i64));
    Ok(consumers)
}

/// 通过 NATS 系统 JSZ 请求获取 JetStream 摘要。
#[tauri::command]
pub async fn fetch_jetstream_summary(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<JetStreamSummary, AppError> {
    let conn = state
        .connections
        .get(&connection_id)
        .ok_or_else(|| AppError::ConnectionNotFound(connection_id.clone()))?;

    let client = conn
        .client
        .clone()
        .ok_or_else(|| AppError::Connection("Not connected".into()))?;

    let jsz_raw = client
        .request("$SYS.REQ.SERVER.PING.JSZ".to_string(), "".into())
        .await
        .map(|r| String::from_utf8_lossy(&r.payload).to_string())
        .unwrap_or_default();

    let mut summary = JetStreamSummary {
        streams: 0,
        consumers: 0,
        messages: 0,
        bytes: 0,
        pending: 0,
        storage_types: HashMap::new(),
    };

    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&jsz_raw) {
        summary.streams = json["streams"].as_u64().unwrap_or(0);
        summary.consumers = json["consumers"].as_u64().unwrap_or(0);
        summary.messages = json["messages"].as_u64().unwrap_or(0);
        summary.bytes = json["bytes"].as_u64().unwrap_or(0);
        if let Some(m) = json["store"].as_u64() {
            summary.bytes = m;
        }
    }

    Ok(summary)
}
