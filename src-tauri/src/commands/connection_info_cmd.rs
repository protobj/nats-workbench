//! 连接详细信息命令 - 获取 NATS 客户端实时诊断和服务器信息

use crate::error::AppError;
use crate::state::AppState;
use log::{info, error};
use serde::Serialize;
use std::sync::atomic::Ordering;
use tauri::State;

/// 通过连接 ID 从应用状态中获取已连接的 NATS 客户端的辅助函数。
fn get_client(state: &AppState, connection_id: &str) -> Result<async_nats::Client, AppError> {
    state
        .connections
        .get(connection_id)
        .ok_or_else(|| AppError::ConnectionNotFound(connection_id.to_string()))?
        .client
        .clone()
        .ok_or_else(|| AppError::Connection("Not connected".into()))
}

/// 服务器信息
#[derive(Debug, Clone, Serialize)]
pub struct ServerInfoResponse {
    pub server_id: String,
    pub server_name: String,
    pub version: String,
    pub go_version: String,
    pub host: String,
    pub port: u16,
    pub max_payload: usize,
    pub proto_version: i64,
    pub cluster: Option<String>,
    pub connect_urls: Vec<String>,
    pub nonce: Option<String>,
    pub jetstream: bool,
    pub client_id: u64,
    pub client_ip: String,
}

/// 客户端统计信息
#[derive(Debug, Clone, Serialize)]
pub struct ClientStatistics {
    pub messages_sent: u64,
    pub messages_received: u64,
    pub bytes_sent: u64,
    pub bytes_received: u64,
    pub reconnects: u64,
    pub pings_sent: u64,
    pub pongs_received: u64,
    pub subscriptions: u32,
    pub slow_consumers: u64,
}

/// 连接状态枚举
#[derive(Debug, Clone, Serialize)]
pub struct ConnectionStateResponse {
    pub state: String,
    pub is_connected: bool,
    pub is_reconnecting: bool,
    pub is_closed: bool,
}

/// NATS 账户信息
#[derive(Debug, Clone, Serialize)]
pub struct AccountInfo {
    pub account_id: Option<String>,
    pub jetstream_enabled: bool,
    pub jetstream_stream_limit: i64,
    pub jetstream_consumer_limit: i64,
    pub jetstream_max_memory: i64,
    pub jetstream_max_storage: i64,
}

/// 获取 NATS 服务器的详细信息，包括服务器 ID、版本、协议、客户端信息等。
#[tauri::command]
pub async fn fetch_server_info(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<ServerInfoResponse, AppError> {
    info!("Fetching server info for {}", connection_id);
    let client = get_client(&state, &connection_id)?;
    let info = client.server_info();

    Ok(ServerInfoResponse {
        server_id: info.server_id,
        server_name: info.server_name,
        version: info.version,
        go_version: info.go,
        host: info.host,
        port: info.port,
        max_payload: info.max_payload,
        proto_version: info.proto as i64,
        cluster: None,
        connect_urls: info.connect_urls,
        nonce: if info.nonce.is_empty() {
            None
        } else {
            Some(info.nonce)
        },
        jetstream: false,
        client_id: info.client_id,
        client_ip: info.client_ip,
    })
}

/// 获取客户端统计信息，包括发送/接收的消息数和字节数。
#[tauri::command]
pub async fn fetch_client_statistics(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<ClientStatistics, AppError> {
    info!("Fetching client statistics for {}", connection_id);
    let client = get_client(&state, &connection_id)?;
    let stats = client.statistics();

    Ok(ClientStatistics {
        messages_sent: stats.out_messages.load(Ordering::Relaxed),
        messages_received: stats.in_messages.load(Ordering::Relaxed),
        bytes_sent: stats.out_bytes.load(Ordering::Relaxed),
        bytes_received: stats.in_bytes.load(Ordering::Relaxed),
        reconnects: stats.connects.load(Ordering::Relaxed),
        pings_sent: 0,
        pongs_received: 0,
        subscriptions: 0,
        slow_consumers: 0,
    })
}

/// 获取当前连接的状态（pending、connected 或 disconnected）。
#[tauri::command]
pub async fn fetch_connection_state(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<ConnectionStateResponse, AppError> {
    info!("Fetching connection state for {}", connection_id);
    let client = get_client(&state, &connection_id)?;
    let conn_state = client.connection_state();

    Ok(ConnectionStateResponse {
        state: conn_state.to_string(),
        is_connected: matches!(conn_state, async_nats::connection::State::Connected),
        is_reconnecting: false,
        is_closed: matches!(conn_state, async_nats::connection::State::Disconnected),
    })
}

/// 获取当前连接协商的最大有效负载大小（字节）。
#[tauri::command]
pub async fn get_max_payload(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<usize, AppError> {
    info!("Getting max payload for {}", connection_id);
    let client = get_client(&state, &connection_id)?;
    Ok(client.max_payload())
}

/// 刷新连接，确保所有已发布但尚未发送的消息被写出到服务器。
#[tauri::command]
pub async fn flush_connection(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<(), AppError> {
    info!("Flushing connection {}", connection_id);
    let client = get_client(&state, &connection_id)?;
    client
        .flush()
        .await
        .map_err(|e| { error!("Flush failed: {}", e); AppError::Nats(format!("flush failed: {}", e)) })
}

/// 排空连接：关闭所有订阅，停止发布，刷新剩余消息后关闭连接。
#[tauri::command]
pub async fn drain_connection(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<(), AppError> {
    info!("Draining connection {}", connection_id);
    let client = get_client(&state, &connection_id)?;
    client
        .drain()
        .await
        .map_err(|e| { error!("Drain failed: {}", e); AppError::Nats(format!("drain failed: {}", e)) })
}

/// 强制客户端立即重连到服务器，通常用于重新触发 auth-callback 或手动负载均衡。
#[tauri::command]
pub async fn force_reconnect(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<(), AppError> {
    info!("Force reconnecting {}", connection_id);
    let client = get_client(&state, &connection_id)?;
    client
        .force_reconnect()
        .await
        .map_err(|e| { error!("Reconnect failed: {}", e); AppError::Nats(format!("reconnect failed: {}", e)) })
}

/// 查询当前连接的 NATS 账户信息，包括 JetStream 存储、内存和流/消费者限制。
#[tauri::command]
pub async fn query_account_info(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<AccountInfo, AppError> {
    info!("Querying account info for {}", connection_id);
    let client = get_client(&state, &connection_id)?;
    let jetstream = async_nats::jetstream::new(client);

    let account = jetstream
        .query_account()
        .await
        .map_err(|e| { error!("Query account failed: {}", e); AppError::Nats(format!("query_account failed: {}", e)) })?;

    Ok(AccountInfo {
        account_id: None,
        jetstream_enabled: account.streams > 0 || account.memory > 0,
        jetstream_stream_limit: account.limits.max_streams.unwrap_or(-1),
        jetstream_consumer_limit: account.limits.max_consumers.unwrap_or(-1),
        jetstream_max_memory: account.limits.max_memory.unwrap_or(-1),
        jetstream_max_storage: account.limits.max_storage.unwrap_or(-1),
    })
}
