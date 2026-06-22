//! 订阅、取消订阅、发布和发现 NATS 主题的命令。

use crate::error::AppError;
use crate::nats::message::NatsMessageEvent;
use crate::state::AppState;
use dashmap::DashMap;
use log::{info, error};
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;
use tauri::Emitter;
use tauri::State;
use tokio_stream::StreamExt;

/// 订阅 NATS 主题的请求载荷。
#[derive(serde::Deserialize)]
pub struct SubscribeRequest {
    pub connection_id: String,
    pub subject: String,
}

/// 取消订阅 NATS 主题的请求载荷。
#[derive(serde::Deserialize)]
pub struct UnsubscribeRequest {
    pub connection_id: String,
    pub subscription_id: String,
}

/// 活动 NATS 订阅的信息。
#[derive(serde::Serialize)]
pub struct SubscriptionInfo {
    pub id: String,
    pub subject: String,
    pub connection_id: String,
}

/// 向 NATS 主题发布消息的请求载荷。
#[derive(serde::Deserialize)]
pub struct PublishRequest {
    pub connection_id: String,
    pub subject: String,
    pub reply_to: Option<String>,
    pub payload: String,
    pub headers: Option<std::collections::HashMap<String, Vec<String>>>,
}

/// 在 NATS 主题上进行请求-回复调用的请求载荷。
#[derive(serde::Deserialize)]
pub struct RequestPayload {
    pub connection_id: String,
    pub subject: String,
    pub payload: String,
    pub timeout_ms: Option<u64>,
}

/// 订阅 NATS 主题并将接收到的消息作为事件发送。
#[tauri::command]
pub async fn subscribe(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    req: SubscribeRequest,
) -> Result<SubscriptionInfo, AppError> {
    let conn = state
        .connections
        .get(&req.connection_id)
        .ok_or_else(|| AppError::ConnectionNotFound(req.connection_id.clone()))?;

    let client = conn.client.clone().ok_or_else(|| {
        AppError::Connection("Connection not established".into())
    })?;

    let sub_id = uuid::Uuid::new_v4().to_string();
    let sub_id_clone = sub_id.clone();
    let conn_id = req.connection_id.clone();
    let subject = req.subject.clone();

    info!("Subscribe: {} → {}", conn_id, subject);

    let mut subscriber = client
        .subscribe(subject.clone())
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    let handle = tokio::spawn(async move {
        loop {
            match tokio::time::timeout(Duration::from_secs(300), subscriber.next()).await {
                Ok(Some(msg)) => {
                    let event = NatsMessageEvent::from_message(
                        msg,
                        conn_id.clone(),
                        sub_id_clone.clone(),
                    );
                    let _ = app_handle.emit("nats-message", &event);
                }
                Ok(None) | Err(_) => break,
            }
            tokio::task::yield_now().await;
        }
    });

    conn.subscriptions.insert(sub_id.clone(), handle);
    conn.stats.subscriptions_count.fetch_add(1, Ordering::Relaxed);

    Ok(SubscriptionInfo {
        id: sub_id,
        subject,
        connection_id: req.connection_id,
    })
}

/// 取消之前创建的订阅。
#[tauri::command]
pub async fn unsubscribe(
    state: State<'_, AppState>,
    req: UnsubscribeRequest,
) -> Result<(), AppError> {
    info!("Unsubscribe: {}", req.subscription_id);
    let conn = state
        .connections
        .get(&req.connection_id)
        .ok_or_else(|| AppError::ConnectionNotFound(req.connection_id.clone()))?;

    if let Some((_, handle)) = conn.subscriptions.remove(&req.subscription_id) {
        handle.abort();
        conn.stats.subscriptions_count.fetch_sub(1, Ordering::Relaxed);
    }

    Ok(())
}

/// 向 NATS 主题发布消息，可选择指定回复主题。
#[tauri::command]
pub async fn publish(
    state: State<'_, AppState>,
    req: PublishRequest,
) -> Result<(), AppError> {
    info!("Publish: {} → {} ({} bytes)", req.connection_id, req.subject, req.payload.len());
    let conn = state
        .connections
        .get(&req.connection_id)
        .ok_or_else(|| AppError::ConnectionNotFound(req.connection_id.clone()))?;

    let client = conn.client.clone().ok_or_else(|| {
        AppError::Connection("Connection not established".into())
    })?;

    let payload: bytes::Bytes = req.payload.clone().into_bytes().into();

    if let Some(ref reply) = req.reply_to {
        client
            .publish_with_reply(req.subject, reply.clone(), payload)
            .await
            .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;
    } else {
        client
            .publish(req.subject, payload)
            .await
            .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;
    }

    conn.stats.msgs_out.fetch_add(1, Ordering::Relaxed);
    conn.stats
        .bytes_out
        .fetch_add(req.payload.len() as u64, Ordering::Relaxed);

    Ok(())
}

/// 向 NATS 主题发送请求，并以字符串形式返回回复载荷。
#[tauri::command]
pub async fn send_request(
    state: State<'_, AppState>,
    req: RequestPayload,
) -> Result<String, AppError> {
    info!("Request: {} → {}", req.connection_id, req.subject);
    let conn = state
        .connections
        .get(&req.connection_id)
        .ok_or_else(|| AppError::ConnectionNotFound(req.connection_id.clone()))?;

    let client = conn.client.clone().ok_or_else(|| {
        AppError::Connection("Connection not established".into())
    })?;

    let _timeout = Duration::from_millis(req.timeout_ms.unwrap_or(5000));
    let payload: bytes::Bytes = req.payload.clone().into_bytes().into();

    let response = client
        .request(req.subject.clone(), payload)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    Ok(String::from_utf8_lossy(&response.payload).to_string())
}

/// 带 NATS 头部的发布请求。
#[derive(Debug, Clone, serde::Deserialize)]
pub struct PublishWithHeadersRequest {
    pub connection_id: String,
    pub subject: String,
    pub reply_to: Option<String>,
    pub payload: String,
    pub headers: std::collections::HashMap<String, Vec<String>>,
}

/// 发布带 NATS 头部的消息。
#[tauri::command]
pub async fn publish_with_headers(
    state: State<'_, AppState>,
    req: PublishWithHeadersRequest,
) -> Result<(), AppError> {
    let conn = state
        .connections
        .get(&req.connection_id)
        .ok_or_else(|| AppError::ConnectionNotFound(req.connection_id.clone()))?;

    let client = conn.client.clone().ok_or_else(|| {
        AppError::Connection("Connection not established".into())
    })?;

    let payload: bytes::Bytes = req.payload.clone().into_bytes().into();

    let mut header_map = async_nats::HeaderMap::new();
    for (k, vs) in &req.headers {
        for v in vs {
            header_map.append(k.as_str(), v.as_str());
        }
    }

    if let Some(ref reply) = req.reply_to {
        client
            .publish_with_reply_and_headers(req.subject, reply.clone(), header_map, payload)
            .await
            .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;
    } else {
        client
            .publish_with_headers(req.subject, header_map, payload)
            .await
            .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;
    }

    conn.stats.msgs_out.fetch_add(1, Ordering::Relaxed);
    conn.stats
        .bytes_out
        .fetch_add(req.payload.len() as u64, Ordering::Relaxed);

    Ok(())
}

/// 通过订阅通配符 `>` 持续一段时间来发现活动的主题。
#[tauri::command]
pub async fn discover_subjects(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    connection_id: String,
    duration_ms: Option<u64>,
) -> Result<Vec<String>, AppError> {
    info!("Discovering subjects on {}", connection_id);
    let conn = state
        .connections
        .get(&connection_id)
        .ok_or_else(|| AppError::ConnectionNotFound(connection_id.clone()))?;

    let client = conn.client.clone().ok_or_else(|| {
        AppError::Connection("Connection not established".into())
    })?;

    let duration = Duration::from_millis(duration_ms.unwrap_or(2000));
    let mut subscriber = client
        .subscribe(">".to_string())
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    let conn_id = connection_id.clone();
    let app = app_handle.clone();
    let subjects: Arc<DashMap<String, ()>> = Arc::new(DashMap::new());
    let subjects_clone = subjects.clone();

    let collect_handle = tokio::spawn(async move {
        loop {
            match tokio::time::timeout(Duration::from_secs(1), subscriber.next()).await {
                Ok(Some(msg)) => {
                    let subject = msg.subject.to_string();
                    subjects_clone.insert(subject.clone(), ());
                    let event = NatsMessageEvent::from_message(
                        msg,
                        conn_id.clone(),
                        "discovery".to_string(),
                    );
                    let _ = app.emit("nats-message", &event);
                }
                _ => {}
            }
        }
    });

    tokio::time::sleep(duration).await;
    collect_handle.abort();

    let mut result: Vec<String> = subjects.iter().map(|e| e.key().clone()).collect();
    result.sort();
    info!("Discovered {} subjects", result.len());
    Ok(result)
}
