//! 管理 NATS 键值存储的命令：CRUD 操作、列表和变更监听。

use crate::error::AppError;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tauri::State;
use tokio_stream::StreamExt;

/// NATS KV 存储中的单个键值条目。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KvEntry {
    pub key: String,
    pub value: String,
    pub revision: u64,
    pub created: String,
    pub operation: String,
}

/// NATS 键值存储桶的摘要信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KvStoreInfo {
    pub name: String,
    pub values: u64,
    pub bytes: u64,
}

/// 将键值对放入 KV 存储的请求载荷。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KvPutRequest {
    pub connection_id: String,
    pub bucket: String,
    pub key: String,
    pub value: String,
}

/// 从 KV 存储获取单个键的请求载荷。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KvGetRequest {
    pub connection_id: String,
    pub bucket: String,
    pub key: String,
}

/// 当被监听的 KV 条目发生变化（put、delete 或 purge）时发出的事件。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KvUpdateEvent {
    pub key: String,
    pub value: String,
    pub operation: String,
    pub revision: u64,
}

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

/// 通过扫描前缀为 `KV_` 的流来列出所有 KV 存储桶。
#[tauri::command]
pub async fn list_kv_stores(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<Vec<KvStoreInfo>, AppError> {
    let client = get_client(&state, &connection_id)?;
    let jetstream = async_nats::jetstream::new(client);

    let mut stores = Vec::new();
    let mut name_stream = jetstream.stream_names();
    while let Some(name) = name_stream.next().await {
        if let Ok(n) = name {
            if n.starts_with("KV_") {
                if let Ok(stream) = jetstream.get_stream(&n).await {
                    let info = stream.cached_info().clone();
                    let bucket_name = n.strip_prefix("KV_").unwrap_or(&n).to_string();
                    stores.push(KvStoreInfo {
                        name: bucket_name,
                        values: info.state.messages,
                        bytes: info.state.bytes,
                    });
                }
            }
        }
    }
    Ok(stores)
}

/// 从 KV 存储桶中获取所有键和值。
#[tauri::command]
pub async fn kv_get_keys(
    state: State<'_, AppState>,
    connection_id: String,
    bucket: String,
) -> Result<Vec<KvEntry>, AppError> {
    let client = get_client(&state, &connection_id)?;
    let jetstream = async_nats::jetstream::new(client);
    let store = jetstream
        .get_key_value(&bucket)
        .await
        .map_err(|e| AppError::Nats(e.to_string()))?;

    let mut entries = Vec::new();
    let mut keys = store
        .keys()
        .await
        .map_err(|e| AppError::Nats(e.to_string()))?;

    while let Some(key_result) = keys.next().await {
        if let Ok(key) = key_result {
            if let Ok(Some(value)) = store.get(&key).await {
                entries.push(KvEntry {
                    key,
                    value: String::from_utf8_lossy(&value).to_string(),
                    revision: 0,
                    created: String::new(),
                    operation: "put".into(),
                });
            }
        }
    }
    entries.sort_by_key(|e| e.key.clone());
    Ok(entries)
}

/// 从 KV 存储中获取单个键的值。
#[tauri::command]
pub async fn kv_get(
    state: State<'_, AppState>,
    req: KvGetRequest,
) -> Result<Option<KvEntry>, AppError> {
    let client = get_client(&state, &req.connection_id)?;
    let jetstream = async_nats::jetstream::new(client);
    let store = jetstream
        .get_key_value(&req.bucket)
        .await
        .map_err(|e| AppError::Nats(e.to_string()))?;

    match store.get(&req.key).await {
        Ok(Some(value)) => Ok(Some(KvEntry {
            key: req.key,
            value: String::from_utf8_lossy(&value).to_string(),
            revision: 0,
            created: String::new(),
            operation: "put".into(),
        })),
        Ok(None) => Ok(None),
        Err(e) => Err(AppError::Nats(e.to_string())),
    }
}

/// 将键值对放入 KV 存储，返回新版本号。
#[tauri::command]
pub async fn kv_put(
    state: State<'_, AppState>,
    req: KvPutRequest,
) -> Result<u64, AppError> {
    let client = get_client(&state, &req.connection_id)?;
    let jetstream = async_nats::jetstream::new(client);
    let store = jetstream
        .get_key_value(&req.bucket)
        .await
        .map_err(|e| AppError::Nats(e.to_string()))?;

    let rev = store
        .put(&req.key, req.value.into_bytes().into())
        .await
        .map_err(|e| AppError::Nats(e.to_string()))?;
    Ok(rev)
}

/// 从 KV 存储中删除键。
#[tauri::command]
pub async fn kv_delete(
    state: State<'_, AppState>,
    connection_id: String,
    bucket: String,
    key: String,
) -> Result<(), AppError> {
    let client = get_client(&state, &connection_id)?;
    let jetstream = async_nats::jetstream::new(client);
    let store = jetstream
        .get_key_value(&bucket)
        .await
        .map_err(|e| AppError::Nats(e.to_string()))?;

    store
        .delete(&key)
        .await
        .map_err(|e| AppError::Nats(e.to_string()))
}

/// 开始监听 KV 桶的变化并发出 `kv-update` 事件。
#[tauri::command]
pub async fn kv_watch(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    connection_id: String,
    bucket: String,
    key_filter: Option<String>,
) -> Result<String, AppError> {
    let client = get_client(&state, &connection_id)?;
    let jetstream = async_nats::jetstream::new(client);
    let store = jetstream
        .get_key_value(&bucket)
        .await
        .map_err(|e| AppError::Nats(e.to_string()))?;

    let watch_id = uuid::Uuid::new_v4().to_string();
    let wid = watch_id.clone();
    let bucket_clone = bucket.clone();
    let filter = key_filter.clone();

    tokio::spawn(async move {
        let watcher = match filter.as_ref() {
            Some(k) => store.watch(k).await,
            None => store.watch_all().await,
        };

        let mut watcher = match watcher {
            Ok(w) => w,
            Err(_) => return,
        };

        loop {
            match tokio::time::timeout(std::time::Duration::from_secs(30), watcher.next()).await {
                Ok(Some(entry)) => {
                    if let Ok(e) = entry {
                        let value = String::from_utf8_lossy(&e.value).to_string();
                        let op = match e.operation {
                            async_nats::jetstream::kv::Operation::Put => "put",
                            async_nats::jetstream::kv::Operation::Delete => "delete",
                            async_nats::jetstream::kv::Operation::Purge => "purge",
                        };
                        let event = KvUpdateEvent {
                            key: e.key,
                            value,
                            operation: op.into(),
                            revision: e.revision,
                        };
                        let _ = app_handle.emit("kv-update", &event);
                    }
                }
                Ok(None) | Err(_) => break,
            }
        }
    });

    Ok(wid)
}

/// 创建新的 KV 存储桶。
#[tauri::command]
pub async fn create_kv_store(
    state: State<'_, AppState>,
    connection_id: String,
    bucket: String,
    description: Option<String>,
) -> Result<(), AppError> {
    let client = get_client(&state, &connection_id)?;
    let jetstream = async_nats::jetstream::new(client);
    let cfg = async_nats::jetstream::kv::Config {
        bucket: bucket.clone(),
        description: description.unwrap_or_default(),
        ..Default::default()
    };
    tokio::time::timeout(
        std::time::Duration::from_secs(30),
        jetstream.create_key_value(cfg),
    )
    .await
    .map_err(|_| AppError::Nats(format!("Create KV store '{}' timed out (30s). Is JetStream enabled?", bucket)))?
    .map(|_| ())
    .map_err(|e| AppError::Nats(e.to_string()))
}

/// 删除 KV 存储桶。
#[tauri::command]
pub async fn delete_kv_store(
    state: State<'_, AppState>,
    connection_id: String,
    bucket: String,
) -> Result<(), AppError> {
    let client = get_client(&state, &connection_id)?;
    let jetstream = async_nats::jetstream::new(client);
    tokio::time::timeout(
        std::time::Duration::from_secs(30),
        jetstream.delete_key_value(&bucket),
    )
    .await
    .map_err(|_| AppError::Nats("Delete KV store timed out (30s)".into()))?
    .map(|_| ())
    .map_err(|e| AppError::Nats(e.to_string()))
}
