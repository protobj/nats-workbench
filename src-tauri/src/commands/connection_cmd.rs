//! 管理 NATS 连接配置、连接和断开的命令。

use crate::error::AppError;
use crate::nats::config::{ConnectionConfig, ConnectionStatus};
use crate::nats::connection::NatsConnection;
use crate::state::{AppState, ConnectionSummary};
use std::sync::Arc;
use tauri::State;
use tauri_plugin_store::StoreExt;

/// 打开连接配置的持久化存储。
fn get_store<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
) -> Result<Arc<tauri_plugin_store::Store<R>>, AppError> {
    app_handle
        .store("connections.json")
        .map_err(|e| AppError::Config(e.to_string()))
}

/// 从存储中加载所有已保存的连接配置。
fn load_configs_from_store<R: tauri::Runtime>(
    store: &tauri_plugin_store::Store<R>,
) -> Result<Vec<ConnectionConfig>, AppError> {
    let raw = store.get("configs");
    if let Some(json_value) = raw {
        let json: String = serde_json::from_value(json_value)
            .map_err(|e| AppError::Config(e.to_string()))?;
        serde_json::from_str(&json).map_err(|e| AppError::Config(e.to_string()))
    } else {
        Ok(Vec::new())
    }
}

/// 将连接配置持久化到存储中。
fn save_configs_to_store<R: tauri::Runtime>(
    store: &tauri_plugin_store::Store<R>,
    configs: &[ConnectionConfig],
) -> Result<(), AppError> {
    let json = serde_json::to_string(configs).map_err(|e| AppError::Config(e.to_string()))?;
    let value: serde_json::Value = serde_json::Value::String(json);
    store.set("configs", value);
    store.save().map_err(|e| AppError::Config(e.to_string()))?;
    Ok(())
}

/// 列出所有已保存的连接配置。
#[tauri::command]
pub async fn list_configs(
    app_handle: tauri::AppHandle,
) -> Result<Vec<ConnectionConfig>, AppError> {
    let store = get_store(&app_handle)?;
    load_configs_from_store(&store)
}

/// 创建或更新连接配置。
#[tauri::command]
pub async fn save_config(
    app_handle: tauri::AppHandle,
    config: ConnectionConfig,
) -> Result<(), AppError> {
    let store = get_store(&app_handle)?;
    let mut configs = load_configs_from_store(&store)?;
    if let Some(pos) = configs.iter().position(|c| c.id == config.id) {
        configs[pos] = config;
    } else {
        configs.push(config);
    }
    save_configs_to_store(&store, &configs)
}

/// 根据 ID 删除连接配置。
#[tauri::command]
pub async fn delete_config(
    app_handle: tauri::AppHandle,
    id: String,
) -> Result<(), AppError> {
    let store = get_store(&app_handle)?;
    let mut configs = load_configs_from_store(&store)?;
    configs.retain(|c| c.id != id);
    save_configs_to_store(&store, &configs)
}

/// 将连接配置导出为 JSON 字符串。
#[tauri::command]
pub async fn export_config(
    app_handle: tauri::AppHandle,
    id: String,
) -> Result<String, AppError> {
    let store = get_store(&app_handle)?;
    let configs = load_configs_from_store(&store)?;
    let config = configs
        .into_iter()
        .find(|c| c.id == id)
        .ok_or_else(|| AppError::Config("Config not found".into()))?;
    serde_json::to_string(&config).map_err(|e| AppError::Config(e.to_string()))
}

/// 从 JSON 字符串导入连接配置并保存。
#[tauri::command]
pub async fn import_config(
    app_handle: tauri::AppHandle,
    json: String,
) -> Result<ConnectionConfig, AppError> {
    let store = get_store(&app_handle)?;
    let config: ConnectionConfig =
        serde_json::from_str(&json).map_err(|e| AppError::Config(e.to_string()))?;
    let mut configs = load_configs_from_store(&store)?;
    if let Some(pos) = configs.iter().position(|c| c.id == config.id) {
        configs[pos] = config.clone();
    } else {
        configs.push(config.clone());
    }
    save_configs_to_store(&store, &configs)?;
    Ok(config)
}

/// 使用给定配置连接到 NATS 服务器。
#[tauri::command]
pub async fn connect(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    config: ConnectionConfig,
) -> Result<ConnectionStatus, AppError> {
    let conn_id = config.id.clone();

    if state.connections.contains_key(&conn_id) {
        return Err(AppError::Connection(format!(
            "Connection '{}' already exists. Disconnect first.",
            config.label
        )));
    }

    let mut nats_conn = NatsConnection::new(config.clone());
    nats_conn.connect().await?;

    let status = nats_conn.get_status(&app_handle, &conn_id).await;
    nats_conn.start_monitor(app_handle.clone(), conn_id.clone()).await;

    state.connections.insert(conn_id, nats_conn);

    let store = get_store(&app_handle)?;
    let mut configs = load_configs_from_store(&store)?;
    if let Some(pos) = configs.iter().position(|c| c.id == config.id) {
        configs[pos] = config;
    } else {
        configs.push(config);
    }
    save_configs_to_store(&store, &configs)?;

    Ok(status)
}

/// 根据 ID 断开活动的 NATS 连接。
#[tauri::command]
pub async fn disconnect(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    let mut entry = state
        .connections
        .remove(&id)
        .ok_or_else(|| AppError::ConnectionNotFound(id.clone()))?;
    entry.1.disconnect().await?;
    Ok(())
}

/// 返回活动 NATS 连接的当前状态。
#[tauri::command]
pub async fn get_status(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    id: String,
) -> Result<ConnectionStatus, AppError> {
    let conn = state
        .connections
        .get(&id)
        .ok_or_else(|| AppError::ConnectionNotFound(id.clone()))?;
    Ok(conn.get_status(&app_handle, &id).await)
}

/// 列出所有当前活动连接的摘要信息。
#[tauri::command]
pub async fn list_active_connections(
    state: State<'_, AppState>,
) -> Result<Vec<ConnectionSummary>, AppError> {
    let mut summaries = Vec::new();
    for entry in state.connections.iter() {
        let conn = entry.value();
        let state = conn.stats.state.lock().await.clone();
        let server_addr = conn.stats.server_addr.lock().await.clone();
        let connected_at = conn.connected_at.lock().await.map(|t| t.to_rfc3339());
        summaries.push(ConnectionSummary {
            id: entry.key().clone(),
            label: conn.config.label.clone(),
            state,
            server_addr,
            connected_at,
        });
    }
    Ok(summaries)
}

/// 通过连接、读取服务器版本然后断开来测试连接。
#[tauri::command]
pub async fn test_connection(
    config: ConnectionConfig,
) -> Result<String, AppError> {
    let mut nats_conn = NatsConnection::new(config);
    nats_conn.connect().await?;
    let version = nats_conn.stats.server_version.lock().await.clone();
    nats_conn.disconnect().await?;
    Ok(format!("Connected successfully. Server: {}", version))
}
