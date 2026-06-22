//! 管理 JetStream 流、消费者和消息的命令。

use crate::error::AppError;
use crate::state::AppState;
use log::{info, error};
use serde::{Deserialize, Serialize};
use tauri::State;
use time::OffsetDateTime;
use tokio_stream::StreamExt;

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

/// 创建 JetStream 流的输入配置。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamConfigInput {
    pub name: String,
    pub subjects: Vec<String>,
    pub max_msgs: Option<i64>,
    pub max_bytes: Option<i64>,
    pub replicas: Option<u32>,
    pub description: Option<String>,
}

/// JetStream 流的信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamInfo {
    pub name: String,
    pub subjects: Vec<String>,
    pub messages: u64,
    pub consumers: u64,
    pub first_seq: u64,
    pub last_seq: u64,
    pub bytes: u64,
    pub retention: String,
    pub storage: String,
    pub max_bytes: i64,
    pub max_msgs: i64,
    pub replicas: u32,
    pub description: String,
}

/// JetStream 流中的单条消息。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamMessage {
    pub seq: u64,
    pub subject: String,
    pub payload: String,
    pub timestamp: String,
    pub size: usize,
}

/// 创建 JetStream 消费者的输入配置。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsumerConfigInput {
    pub stream: String,
    pub name: Option<String>,
    pub description: Option<String>,
    pub ack_policy: Option<String>,
    pub deliver_policy: Option<String>,
    pub filter_subject: Option<String>,
    pub max_deliver: Option<i64>,
    pub ack_wait_secs: Option<u64>,
    pub max_ack_pending: Option<i64>,
}

/// JetStream 消费者的信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsumerInfo {
    pub name: String,
    pub stream: String,
    pub durable: bool,
    pub push_mode: bool,
    pub ack_policy: String,
    pub deliver_policy: String,
    pub filter_subject: String,
    pub max_deliver: u64,
    pub ack_pending: u64,
    pub redelivered: u64,
    pub waiting: u64,
    pub max_ack_pending: u64,
}

/// 列出给定连接的所有流及其信息。
#[tauri::command]
pub async fn list_streams(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<Vec<StreamInfo>, AppError> {
    info!("Listing streams for {}", connection_id);
    let client = get_client(&state, &connection_id)?;
    let jetstream = async_nats::jetstream::new(client);

    let mut names: Vec<String> = Vec::new();
    let mut name_stream = jetstream.stream_names();
    while let Some(name) = name_stream.next().await {
        if let Ok(n) = name {
            names.push(n);
        }
    }

    let mut infos = Vec::new();
    for name in names {
        if let Ok(stream) = jetstream.get_stream(&name).await {
            let info = stream.cached_info().clone();
            let subjects: Vec<String> = info
                .config
                .subjects
                .iter()
                .map(|s| s.to_string())
                .collect();
            infos.push(StreamInfo {
                name: info.config.name,
                subjects,
                messages: info.state.messages,
                consumers: info.state.consumer_count as u64,
                first_seq: info.state.first_sequence,
                last_seq: info.state.last_sequence,
                bytes: info.state.bytes,
                retention: format!("{:?}", info.config.retention),
                storage: format!("{:?}", info.config.storage),
                max_bytes: info.config.max_bytes,
                max_msgs: info.config.max_messages,
                replicas: info.config.num_replicas as u32,
                description: info.config.description.unwrap_or_default(),
            });
        }
    }
    Ok(infos)
}

/// 使用给定配置创建新的 JetStream 流。
#[tauri::command]
pub async fn create_stream(
    state: State<'_, AppState>,
    connection_id: String,
    config: StreamConfigInput,
) -> Result<StreamInfo, AppError> {
    info!("Creating stream '{}' on {}", config.name, connection_id);
    let client = get_client(&state, &connection_id)?;
    let jetstream = async_nats::jetstream::new(client);

    let stream_config = async_nats::jetstream::stream::Config {
        name: config.name.clone(),
        subjects: config.subjects.clone(),
        max_messages: config.max_msgs.unwrap_or(-1),
        max_bytes: config.max_bytes.unwrap_or(-1),
        num_replicas: config.replicas.unwrap_or(1) as usize,
        description: config.description.clone(),
        ..Default::default()
    };

    let stream = jetstream
        .create_stream(stream_config)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    let info = stream.cached_info().clone();
    Ok(StreamInfo {
        name: info.config.name,
        subjects: config.subjects.clone(),
        messages: 0,
        consumers: 0,
        first_seq: 0,
        last_seq: 0,
        bytes: 0,
        retention: format!("{:?}", info.config.retention),
        storage: format!("{:?}", info.config.storage),
        max_bytes: info.config.max_bytes,
        max_msgs: info.config.max_messages,
        replicas: info.config.num_replicas as u32,
        description: info.config.description.unwrap_or_default(),
    })
}

/// 根据名称删除 JetStream 流。
#[tauri::command]
pub async fn delete_stream(
    state: State<'_, AppState>,
    connection_id: String,
    stream_name: String,
) -> Result<(), AppError> {
    info!("Deleting stream '{}' on {}", stream_name, connection_id);
    let client = get_client(&state, &connection_id)?;
    let jetstream = async_nats::jetstream::new(client);
    jetstream
        .delete_stream(&stream_name)
        .await
        .map(|_| ())
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })
}

/// 清空 JetStream 流中的所有消息。
#[tauri::command]
pub async fn purge_stream(
    state: State<'_, AppState>,
    connection_id: String,
    stream_name: String,
) -> Result<(), AppError> {
    info!("Purging stream '{}' on {}", stream_name, connection_id);
    let client = get_client(&state, &connection_id)?;
    let stream = async_nats::jetstream::new(client)
        .get_stream(&stream_name)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;
    stream.purge().await.map(|_| ()).map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })
}

/// 从流中获取消息，可指定起始序号和数量限制。
#[tauri::command]
pub async fn stream_messages(
    state: State<'_, AppState>,
    connection_id: String,
    stream_name: String,
    start_seq: Option<u64>,
    limit: Option<usize>,
) -> Result<Vec<StreamMessage>, AppError> {
    let client = get_client(&state, &connection_id)?;
    let jetstream = async_nats::jetstream::new(client);

    let stream = jetstream
        .get_stream(&stream_name)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    use async_nats::jetstream::consumer;
    let cfg = consumer::pull::Config {
        durable_name: None,
        deliver_policy: consumer::DeliverPolicy::ByStartSequence {
            start_sequence: start_seq.unwrap_or(1),
        },
        ..Default::default()
    };

    let consumer = stream
        .create_consumer(cfg)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    let mut batch = consumer
        .fetch()
        .max_messages(limit.unwrap_or(50))
        .messages()
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    let mut msgs = Vec::new();
    while let Some(msg) = batch.next().await {
        if let Ok(m) = msg {
            let meta = match m.info() {
                Ok(info) => info,
                Err(_) => continue,
            };
            msgs.push(StreamMessage {
                seq: meta.stream_sequence,
                subject: m.subject.to_string(),
                payload: String::from_utf8_lossy(&m.payload).to_string(),
                timestamp: meta.published.to_string(),
                size: m.payload.len(),
            });
        }
    }
    Ok(msgs)
}

/// 根据序号从流中删除单条消息。
#[tauri::command]
pub async fn delete_stream_message(
    state: State<'_, AppState>,
    connection_id: String,
    stream_name: String,
    seq: u64,
) -> Result<(), AppError> {
    let client = get_client(&state, &connection_id)?;
    let jetstream = async_nats::jetstream::new(client);
    let stream = jetstream
        .get_stream(&stream_name)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;
    stream
        .delete_message(seq)
        .await
        .map(|_| ())
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })
}

/// 列出给定流的所有消费者。
#[tauri::command]
pub async fn list_consumers(
    state: State<'_, AppState>,
    connection_id: String,
    stream_name: String,
) -> Result<Vec<ConsumerInfo>, AppError> {
    info!("Listing consumers for stream '{}'", stream_name);
    let client = get_client(&state, &connection_id)?;
    let jetstream = async_nats::jetstream::new(client);

    let stream = jetstream
        .get_stream(&stream_name)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    let mut names: Vec<String> = Vec::new();
    let mut name_stream = stream.consumer_names();
    while let Some(name) = name_stream.next().await {
        if let Ok(n) = name {
            names.push(n);
        }
    }

    let mut infos = Vec::new();
    for c_name in names {
        if let Ok(ci) = jetstream
            .get_consumer_from_stream::<async_nats::jetstream::consumer::pull::Config, _, _>(&stream_name, &c_name)
            .await
        {
            let info = ci.cached_info();
            infos.push(ConsumerInfo {
                name: info.name.clone(),
                stream: stream_name.clone(),
                durable: info.config.durable_name.is_some(),
                push_mode: info.config.deliver_subject.is_some(),
                ack_policy: format!("{:?}", info.config.ack_policy),
                deliver_policy: format!("{:?}", info.config.deliver_policy),
                filter_subject: info.config.filter_subject.clone(),
                max_deliver: info.config.max_deliver as u64,
                ack_pending: info.num_ack_pending as u64,
                redelivered: info.num_redelivered as u64,
                waiting: info.num_waiting as u64,
                max_ack_pending: info.config.max_ack_pending as u64,
            });
        }
    }
    Ok(infos)
}

/// 使用给定配置在流上创建新的消费者。
#[tauri::command]
pub async fn create_consumer(
    state: State<'_, AppState>,
    connection_id: String,
    config: ConsumerConfigInput,
) -> Result<ConsumerInfo, AppError> {
    info!("Creating consumer '{}' on stream '{}'", config.name.as_deref().unwrap_or("unnamed"), config.stream);
    let client = get_client(&state, &connection_id)?;
    let jetstream = async_nats::jetstream::new(client);

    let stream = jetstream
        .get_stream(&config.stream)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    use async_nats::jetstream::consumer;
    let mut cfg = consumer::pull::Config {
        durable_name: config.name.clone(),
        description: config.description.clone(),
        filter_subject: config.filter_subject.clone().unwrap_or_default(),
        ..Default::default()
    };

    if let Some(ref a) = config.ack_policy {
        cfg.ack_policy = match a.as_str() {
            "all" => consumer::AckPolicy::All,
            "none" => consumer::AckPolicy::None,
            _ => consumer::AckPolicy::Explicit,
        };
    }
    if let Some(ref d) = config.deliver_policy {
        cfg.deliver_policy = match d.as_str() {
            "all" => consumer::DeliverPolicy::All,
            "last" => consumer::DeliverPolicy::Last,
            "new" => consumer::DeliverPolicy::New,
            _ => consumer::DeliverPolicy::All,
        };
    }
    if let Some(ref s) = config.ack_wait_secs {
        cfg.ack_wait = std::time::Duration::from_secs(*s);
    }
    if let Some(m) = config.max_deliver {
        cfg.max_deliver = m;
    }
    if let Some(m) = config.max_ack_pending {
        cfg.max_ack_pending = m;
    }

    let ci = stream
        .create_consumer(cfg)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    let info = ci.cached_info();
    Ok(ConsumerInfo {
        name: info.name.clone(),
        stream: config.stream.clone(),
        durable: info.config.durable_name.is_some(),
        push_mode: false,
        ack_policy: format!("{:?}", info.config.ack_policy),
        deliver_policy: format!("{:?}", info.config.deliver_policy),
        filter_subject: info.config.filter_subject.clone(),
        max_deliver: info.config.max_deliver as u64,
        ack_pending: info.num_ack_pending as u64,
        redelivered: info.num_redelivered as u64,
        waiting: info.num_waiting as u64,
        max_ack_pending: info.config.max_ack_pending as u64,
    })
}

/// 根据消费者名称从流中删除消费者。
#[tauri::command]
pub async fn delete_consumer(
    state: State<'_, AppState>,
    connection_id: String,
    stream_name: String,
    consumer_name: String,
) -> Result<(), AppError> {
    info!("Deleting consumer '{}' from stream '{}'", consumer_name, stream_name);
    let client = get_client(&state, &connection_id)?;
    let jetstream = async_nats::jetstream::new(client);
    jetstream
        .delete_consumer_from_stream(&stream_name, &consumer_name)
        .await
        .map(|_| ())
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })
}

/// 更新流配置
#[tauri::command]
pub async fn update_stream(
    state: State<'_, AppState>,
    connection_id: String,
    stream_name: String,
    max_msgs: Option<i64>,
    max_bytes: Option<i64>,
    max_age_secs: Option<i64>,
    max_msg_size: Option<i64>,
    replicas: Option<u32>,
    description: Option<String>,
) -> Result<StreamInfo, AppError> {
    info!("Updating stream '{}' config on {}", stream_name, connection_id);
    let client = get_client(&state, &connection_id)?;
    let jetstream = async_nats::jetstream::new(client);

    let stream = jetstream
        .get_stream(&stream_name)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    let mut config = stream.cached_info().config.clone();

    if let Some(v) = max_msgs {
        config.max_messages = v;
    }
    if let Some(v) = max_bytes {
        config.max_bytes = v;
    }
    if let Some(v) = max_age_secs {
        config.max_age = std::time::Duration::from_secs(v as u64);
    }
    if let Some(v) = max_msg_size {
        config.max_message_size = v as i32;
    }
    if let Some(v) = replicas {
        config.num_replicas = v as usize;
    }
    if let Some(v) = description {
        config.description = Some(v);
    }

    let info = jetstream
        .update_stream(config)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    let subjects: Vec<String> = info
        .config
        .subjects
        .iter()
        .map(|s| s.to_string())
        .collect();
    Ok(StreamInfo {
        name: info.config.name,
        subjects,
        messages: info.state.messages,
        consumers: info.state.consumer_count as u64,
        first_seq: info.state.first_sequence,
        last_seq: info.state.last_sequence,
        bytes: info.state.bytes,
        retention: format!("{:?}", info.config.retention),
        storage: format!("{:?}", info.config.storage),
        max_bytes: info.config.max_bytes,
        max_msgs: info.config.max_messages,
        replicas: info.config.num_replicas as u32,
        description: info.config.description.unwrap_or_default(),
    })
}

/// 直接从流中按序号获取单条消息
#[tauri::command]
pub async fn direct_get_message(
    state: State<'_, AppState>,
    connection_id: String,
    stream_name: String,
    sequence: u64,
) -> Result<Option<StreamMessage>, AppError> {
    let client = get_client(&state, &connection_id)?;
    let jetstream = async_nats::jetstream::new(client);
    let stream = jetstream
        .get_stream(&stream_name)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    match stream.direct_get(sequence).await {
        Ok(msg) => Ok(Some(StreamMessage {
            seq: msg.sequence,
            subject: msg.subject.to_string(),
            payload: String::from_utf8_lossy(&msg.payload).to_string(),
            timestamp: msg.time.to_string(),
            size: msg.payload.len(),
        })),
        Err(e) => {
            if e.to_string().to_lowercase().contains("not found") {
                Ok(None)
            } else {
                Err({ error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })
            }
        }
    }
}

/// 暂停消费者
#[tauri::command]
pub async fn pause_consumer(
    state: State<'_, AppState>,
    connection_id: String,
    stream_name: String,
    consumer_name: String,
) -> Result<(), AppError> {
    info!("Pausing consumer '{}' on stream '{}'", consumer_name, stream_name);
    let client = get_client(&state, &connection_id)?;
    let jetstream = async_nats::jetstream::new(client);
    let stream = jetstream
        .get_stream(&stream_name)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;
    stream
        .pause_consumer(&consumer_name, OffsetDateTime::now_utc() + time::Duration::hours(24))
        .await
        .map(|_| ())
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })
}

/// 恢复消费者
#[tauri::command]
pub async fn resume_consumer(
    state: State<'_, AppState>,
    connection_id: String,
    stream_name: String,
    consumer_name: String,
) -> Result<(), AppError> {
    info!("Resuming consumer '{}' on stream '{}'", consumer_name, stream_name);
    let client = get_client(&state, &connection_id)?;
    let jetstream = async_nats::jetstream::new(client);
    let stream = jetstream
        .get_stream(&stream_name)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;
    stream
        .resume_consumer(&consumer_name)
        .await
        .map(|_| ())
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })
}

/// 重置消费者位移
#[tauri::command]
pub async fn reset_consumer(
    state: State<'_, AppState>,
    connection_id: String,
    stream_name: String,
    consumer_name: String,
    target_seq: Option<u64>,
) -> Result<(), AppError> {
    info!("Resetting consumer '{}' on stream '{}' to seq {:?}", consumer_name, stream_name, target_seq);
    let client = get_client(&state, &connection_id)?;
    let jetstream = async_nats::jetstream::new(client);
    let stream = jetstream
        .get_stream(&stream_name)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;
    stream
        .reset_consumer(&consumer_name, target_seq)
        .await
        .map(|_| ())
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })
}

/// 获取流主题列表（分页）
#[tauri::command]
pub async fn get_stream_subjects(
    state: State<'_, AppState>,
    connection_id: String,
    stream_name: String,
    offset: Option<usize>,
) -> Result<Vec<String>, AppError> {
    let client = get_client(&state, &connection_id)?;
    let jetstream = async_nats::jetstream::new(client);
    let stream = jetstream
        .get_stream(&stream_name)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    let subjects: Vec<String> = stream
        .cached_info()
        .config
        .subjects
        .iter()
        .map(|s| s.to_string())
        .collect();

    let skip = offset.unwrap_or(0);
    Ok(subjects.into_iter().skip(skip).collect())
}
