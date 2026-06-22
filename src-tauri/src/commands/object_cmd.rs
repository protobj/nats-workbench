//! 管理 NATS 对象存储的命令：列出、获取、放入、删除、创建和销毁。

use crate::error::AppError;
use crate::state::AppState;
use log::{info, error};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;
use tokio_stream::StreamExt;

/// NATS 对象存储桶的摘要信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObjStoreInfo {
    pub name: String,
    pub count: u64,
    pub bytes: u64,
}

/// NATS 对象存储中单个对象的元数据。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObjInfo {
    pub name: String,
    pub bucket: String,
    pub size: usize,
    pub chunks: usize,
    pub description: Option<String>,
    pub modified: String,
    pub deleted: bool,
    pub metadata: HashMap<String, String>,
}

/// 将对象放入 NATS 对象存储的请求载荷。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObjPutRequest {
    pub connection_id: String,
    pub bucket: String,
    pub name: String,
    pub data: String,
    pub description: Option<String>,
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

/// 通过扫描前缀为 `OBJ_` 的流来列出所有对象存储桶。
#[tauri::command]
pub async fn list_object_stores(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<Vec<ObjStoreInfo>, AppError> {
    info!("Listing object stores");
    let client = get_client(&state, &connection_id)?;
    let jetstream = async_nats::jetstream::new(client);

    let mut stores = Vec::new();
    let mut name_stream = jetstream.stream_names();
    while let Some(name) = name_stream.next().await {
        if let Ok(n) = name {
            if n.starts_with("OBJ_") {
                if let Ok(stream) = jetstream.get_stream(&n).await {
                    let info = stream.cached_info().clone();
                    let bucket_name = n.strip_prefix("OBJ_").unwrap_or(&n).to_string();
                    stores.push(ObjStoreInfo {
                        name: bucket_name,
                        count: info.state.messages,
                        bytes: info.state.bytes,
                    });
                }
            }
        }
    }
    Ok(stores)
}

/// 列出给定对象存储桶中的所有对象。
#[tauri::command]
pub async fn list_objects(
    state: State<'_, AppState>,
    connection_id: String,
    bucket: String,
) -> Result<Vec<ObjInfo>, AppError> {
    let client = get_client(&state, &connection_id)?;
    let jetstream = async_nats::jetstream::new(client);
    let store = jetstream
        .get_object_store(&bucket)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    let mut objs = Vec::new();
    let mut list = store
        .list()
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    while let Some(info) = list.next().await {
        if let Ok(i) = info {
            objs.push(ObjInfo {
                name: i.name,
                bucket: i.bucket,
                size: i.size,
                chunks: i.chunks,
                description: i.description,
                modified: i.modified.map(|t| t.to_string()).unwrap_or_default(),
                deleted: i.deleted,
                metadata: i.metadata,
            });
        }
    }
    objs.sort_by_key(|o| o.name.clone());
    Ok(objs)
}

/// 从存储中检索对象内容并以字符串形式返回。
#[tauri::command]
pub async fn obj_get(
    state: State<'_, AppState>,
    connection_id: String,
    bucket: String,
    name: String,
) -> Result<String, AppError> {
    let client = get_client(&state, &connection_id)?;
    let jetstream = async_nats::jetstream::new(client);
    let store = jetstream
        .get_object_store(&bucket)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    let mut obj = store
        .get(&name)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    let mut buf = Vec::new();
    use tokio::io::AsyncReadExt;
    obj.read_to_end(&mut buf)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    Ok(String::from_utf8_lossy(&buf).to_string())
}

/// 将对象放入（上传）到存储中，返回其元数据。
#[tauri::command]
pub async fn obj_put(
    state: State<'_, AppState>,
    req: ObjPutRequest,
) -> Result<ObjInfo, AppError> {
    info!("Object put: {} / {}", req.bucket, req.name);
    let client = get_client(&state, &req.connection_id)?;
    let jetstream = async_nats::jetstream::new(client);
    let store = jetstream
        .get_object_store(&req.bucket)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    use async_nats::jetstream::object_store::ObjectMetadata;
    let meta = ObjectMetadata {
        name: req.name.clone(),
        description: req.description,
        headers: None,
        metadata: Default::default(),
        chunk_size: None,
    };

    let data_bytes: bytes::Bytes = req.data.into_bytes().into();
    let mut cursor = std::io::Cursor::new(data_bytes.as_ref());
    let info = store
        .put(meta, &mut cursor)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    Ok(ObjInfo {
        name: info.name,
        bucket: info.bucket,
        size: info.size,
        chunks: info.chunks,
        description: info.description,
        modified: info.modified.map(|t| t.to_string()).unwrap_or_default(),
        deleted: info.deleted,
        metadata: info.metadata,
    })
}

/// 根据名称从存储中删除对象。
#[tauri::command]
pub async fn obj_delete(
    state: State<'_, AppState>,
    connection_id: String,
    bucket: String,
    name: String,
) -> Result<(), AppError> {
    info!("Object delete: {} / {}", bucket, name);
    let client = get_client(&state, &connection_id)?;
    let jetstream = async_nats::jetstream::new(client);
    let store = jetstream
        .get_object_store(&bucket)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    store
        .delete(&name)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })
}

/// 创建新的对象存储桶。
#[tauri::command]
pub async fn create_object_store(
    state: State<'_, AppState>,
    connection_id: String,
    bucket: String,
    description: Option<String>,
) -> Result<(), AppError> {
    info!("Creating object store '{}'", bucket);
    let client = get_client(&state, &connection_id)?;
    let jetstream = async_nats::jetstream::new(client);
    let cfg = async_nats::jetstream::object_store::Config {
        bucket: bucket.clone(),
        description,
        ..Default::default()
    };
    tokio::time::timeout(
        std::time::Duration::from_secs(30),
        jetstream.create_object_store(cfg),
    )
    .await
    .map_err(|_| AppError::Nats(format!("Create object store '{}' timed out (30s)", bucket)))?
    .map(|_| ())
    .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })
}

/// 删除对象存储桶。
#[tauri::command]
pub async fn delete_object_store(
    state: State<'_, AppState>,
    connection_id: String,
    bucket: String,
) -> Result<(), AppError> {
    info!("Deleting object store '{}'", bucket);
    let client = get_client(&state, &connection_id)?;
    let jetstream = async_nats::jetstream::new(client);
    tokio::time::timeout(
        std::time::Duration::from_secs(30),
        jetstream.delete_object_store(&bucket),
    )
    .await
    .map_err(|_| AppError::Nats("Delete object store timed out (30s)".into()))?
    .map(|_| ())
    .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })
}

/// 获取对象元数据（不下载内容）。
#[tauri::command]
pub async fn obj_info(
    state: State<'_, AppState>,
    connection_id: String,
    bucket: String,
    name: String,
) -> Result<ObjInfo, AppError> {
    let client = get_client(&state, &connection_id)?;
    let jetstream = async_nats::jetstream::new(client);
    let store = jetstream
        .get_object_store(&bucket)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    let info = store
        .info(&name)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    Ok(ObjInfo {
        name: info.name,
        bucket: info.bucket,
        size: info.size,
        chunks: info.chunks,
        description: info.description,
        modified: info.modified.map(|t| t.to_string()).unwrap_or_default(),
        deleted: info.deleted,
        metadata: info.metadata,
    })
}

/// 封存对象存储桶（禁止写入）。
#[tauri::command]
pub async fn obj_seal(
    state: State<'_, AppState>,
    connection_id: String,
    bucket: String,
) -> Result<(), AppError> {
    let client = get_client(&state, &connection_id)?;
    let jetstream = async_nats::jetstream::new(client);
    let mut store = jetstream
        .get_object_store(&bucket)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    store
        .seal()
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })
}

/// 更新对象元数据或重命名。
#[tauri::command]
pub async fn obj_update_metadata(
    state: State<'_, AppState>,
    connection_id: String,
    bucket: String,
    name: String,
    new_name: Option<String>,
    new_description: Option<String>,
) -> Result<ObjInfo, AppError> {
    let client = get_client(&state, &connection_id)?;
    let jetstream = async_nats::jetstream::new(client);
    let store = jetstream
        .get_object_store(&bucket)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    let effective_name = new_name.unwrap_or_else(|| name.clone());
    let metadata = async_nats::jetstream::object_store::UpdateMetadata {
        name: effective_name,
        description: new_description,
        ..Default::default()
    };

    let info = store
        .update_metadata(&name, metadata)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    Ok(ObjInfo {
        name: info.name,
        bucket: info.bucket,
        size: info.size,
        chunks: info.chunks,
        description: info.description,
        modified: info.modified.map(|t| t.to_string()).unwrap_or_default(),
        deleted: info.deleted,
        metadata: info.metadata,
    })
}
