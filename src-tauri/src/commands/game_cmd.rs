//! 游戏房间主题发现、性能基准测试和流消息回放的命令。

use crate::error::AppError;
use crate::state::AppState;
use log::{info, error};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tauri::Emitter;
use tauri::State;
use tokio_stream::StreamExt;

/// 在游戏房间内发现的主题信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomTopicInfo {
    pub subject: String,
    pub has_publisher: bool,
    pub has_subscriber: bool,
    pub message_count: u64,
}

/// 运行吞吐量/延迟基准测试的配置。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkConfig {
    pub connection_id: String,
    pub subject: String,
    pub payload_size: usize,
    pub rate_per_sec: u64,
    pub duration_secs: u64,
    pub reply_callback: Option<bool>,
}

/// 已完成的基准测试运行结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkResult {
    pub messages_sent: u64,
    pub messages_recv: u64,
    pub elapsed_secs: f64,
    pub throughput_per_sec: f64,
    pub latency_p50_ms: f64,
    pub latency_p99_ms: f64,
    pub latency_min_ms: f64,
    pub latency_max_ms: f64,
}

/// 将流中的消息回放到目标主题的配置。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplayConfig {
    pub connection_id: String,
    pub stream_name: String,
    pub target_subject: String,
    pub start_seq: Option<u64>,
    pub count: Option<usize>,
    pub delay_ms: Option<u64>,
}

/// 正在进行的基准测试运行期间的实时进度。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkProgress {
    pub sent: u64,
    pub received: u64,
    pub elapsed_secs: f64,
    pub last_latency_ms: f64,
    pub current_throughput: f64,
}

/// 流消息回放操作的进度信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplayProgress {
    pub total: u64,
    pub replayed: u64,
    pub skipped: u64,
    pub done: bool,
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

/// 发现匹配 `room.<id>.*` 模式的主题，持续一段指定时间。
#[tauri::command]
pub async fn discover_room_topics(
    state: State<'_, AppState>,
    connection_id: String,
    room_id: String,
    duration_ms: Option<u64>,
) -> Result<Vec<RoomTopicInfo>, AppError> {
    info!("Discovering room topics for room '{}'", room_id);
    let client = get_client(&state, &connection_id)?;
    let duration = std::time::Duration::from_millis(duration_ms.unwrap_or(3000));
    let subject = format!("room.{}.*", room_id);

    let mut subscriber = client
        .subscribe(subject.clone())
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    let topics: Arc<dashmap::DashMap<String, (u64, bool)>> = Arc::new(dashmap::DashMap::new());
    let topics_clone = topics.clone();

    let handle = tokio::spawn(async move {
        loop {
            match tokio::time::timeout(std::time::Duration::from_secs(1), subscriber.next()).await {
                Ok(Some(msg)) => {
                    let s = msg.subject.to_string();
                    let mut entry = topics_clone.entry(s).or_insert((0, false));
                    entry.0 += 1;
                }
                _ => {}
            }
        }
    });

    tokio::time::sleep(duration).await;
    handle.abort();

    let mut result: Vec<RoomTopicInfo> = topics
        .iter()
        .map(|e| RoomTopicInfo {
            subject: e.key().clone(),
            has_publisher: e.value().0 > 0,
            has_subscriber: true,
            message_count: e.value().0,
        })
        .collect();
    result.sort_by_key(|r| r.subject.clone());
    Ok(result)
}

/// 运行吞吐量/延迟基准测试，发布消息并测量往返时间。
#[tauri::command]
pub async fn run_benchmark(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    config: BenchmarkConfig,
) -> Result<BenchmarkResult, AppError> {
    info!("Benchmark: {} msg/s × {} secs on {}", config.rate_per_sec, config.duration_secs, config.subject);
    let client = get_client(&state, &config.connection_id)?;
    let payload = "x".repeat(config.payload_size);
    let interval_ms = 1000u64 / u64::max(config.rate_per_sec, 1);

    let mut latencies: Vec<f64> = Vec::new();
    let mut sent: u64 = 0;
    let mut received: u64 = 0;

    let reply_subject = format!("_BENCH.{}", uuid::Uuid::new_v4());
    let sub_client = client.clone();
    let reply_clone = reply_subject.clone();
    let start = Instant::now();
    let deadline = start + std::time::Duration::from_secs(config.duration_secs);

    let mut sub = sub_client
        .subscribe(reply_clone.clone())
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    let recv_handle = tokio::spawn(async move {
        loop {
            match tokio::time::timeout(std::time::Duration::from_secs(1), sub.next()).await {
                Ok(Some(msg)) => {
                    let recv_time = Instant::now();
                    if let Ok(sent_ns) = String::from_utf8_lossy(&msg.payload).parse::<u128>() {
                        let sent_instant = Instant::now()
                            - Instant::now().duration_since(start)
                            + std::time::Duration::from_nanos(sent_ns as u64);
                        let latency = recv_time.duration_since(sent_instant).as_secs_f64() * 1000.0;
                        drop(sent_ns);
                        drop(recv_time);
                        drop(sent_instant);
                    }
                }
                Ok(None) | Err(_) => break,
            }
        }
    });

    let mut next_send = tokio::time::Instant::now();

    while Instant::now() < deadline {
        tokio::time::sleep_until(next_send).await;
        let send_time = Instant::now();
        let time_bytes = format!("{}", send_time.duration_since(start).as_nanos());

        if let Ok(()) = client
            .publish_with_reply(config.subject.clone(), reply_subject.clone(), time_bytes.into())
            .await
        {
            sent += 1;
            if let Some(now) = start.elapsed().as_nanos().checked_sub(send_time.duration_since(start).as_nanos()) {
                let latency = now as f64 / 1_000_000.0;
                latencies.push(latency);
            }
        }

        next_send += std::time::Duration::from_millis(interval_ms);
        if next_send < tokio::time::Instant::now() {
            next_send = tokio::time::Instant::now();
        }
    }

    let elapsed = start.elapsed().as_secs_f64();
    recv_handle.abort();

    latencies.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let p50_idx = ((latencies.len() as f64) * 0.50) as usize;
    let p99_idx = ((latencies.len() as f64) * 0.99) as usize;

    Ok(BenchmarkResult {
        messages_sent: sent,
        messages_recv: received,
        elapsed_secs: elapsed,
        throughput_per_sec: if elapsed > 0.0 { sent as f64 / elapsed } else { 0.0 },
        latency_p50_ms: latencies.get(p50_idx).copied().unwrap_or(0.0),
        latency_p99_ms: latencies.get(p99_idx).copied().unwrap_or(0.0),
        latency_min_ms: latencies.first().copied().unwrap_or(0.0),
        latency_max_ms: latencies.last().copied().unwrap_or(0.0),
    })
}

/// 将 JetStream 流中的消息回放到目标主题上。
#[tauri::command]
pub async fn replay_stream_messages(
    state: State<'_, AppState>,
    config: ReplayConfig,
) -> Result<ReplayProgress, AppError> {
    info!("Replaying from stream '{}' to '{}'", config.stream_name, config.target_subject);
    let client = get_client(&state, &config.connection_id)?;
    let jetstream = async_nats::jetstream::new(client.clone());

    let stream = jetstream
        .get_stream(&config.stream_name)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    use async_nats::jetstream::consumer;
    let consumer_cfg = consumer::pull::Config {
        durable_name: None,
        deliver_policy: consumer::DeliverPolicy::ByStartSequence {
            start_sequence: config.start_seq.unwrap_or(1),
        },
        ..Default::default()
    };

    let consumer = stream
        .create_consumer(consumer_cfg)
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    let limit = config.count.unwrap_or(100);
    let mut batch = consumer
        .fetch()
        .max_messages(limit)
        .messages()
        .await
        .map_err(|e| { error!("Operation failed: {}", e); AppError::Nats(e.to_string()) })?;

    let mut total = 0u64;
    let mut replayed = 0u64;
    let mut skipped = 0u64;
    let delay = std::time::Duration::from_millis(config.delay_ms.unwrap_or(0));

    while let Some(msg) = batch.next().await {
        total += 1;
        if let Ok(m) = msg {
            let payload: bytes::Bytes = m.payload.to_vec().into();
            match client
                .publish(config.target_subject.clone(), payload)
                .await
            {
                Ok(_) => replayed += 1,
                Err(_) => skipped += 1,
            }
        } else {
            skipped += 1;
        }

        if delay > std::time::Duration::ZERO {
            tokio::time::sleep(delay).await;
        }
    }

    Ok(ReplayProgress {
        total,
        replayed,
        skipped,
        done: true,
    })
}
